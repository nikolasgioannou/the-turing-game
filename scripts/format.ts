import { access, readFile, writeFile } from 'node:fs/promises';
import * as prettier from 'prettier';
import { parsers } from 'prettier/plugins/babel';

type Node = {
  type: string;
  start: number;
  end: number;
  loc?: { start: { line: number }; end: { line: number } };
  declaration?: Node;
  leadingComments?: Node[];
  [key: string]: unknown;
};

// Prettier handles indentation and wrapping but deliberately does not insert
// blank lines. Add spacing only at parsed statement boundaries, never inside
// strings, JSX text, arrays or object literals.
function separateSections(source: string): string {
  const parse = parsers['babel-ts'].parse as (text: string) => Node;
  const ast = parse(source);
  const insertions = new Set<number>();
  const kind = (node: Node) => node.declaration?.type ?? node.type;
  const isSection = (node: Node) =>
    /(?:FunctionDeclaration|ClassDeclaration|ClassMethod|ClassPrivateMethod|TSInterfaceDeclaration|TSTypeAliasDeclaration|IfStatement|ForStatement|ForOfStatement|ForInStatement|WhileStatement|SwitchStatement|TryStatement|ReturnStatement|ThrowStatement)/.test(
      kind(node),
    ) ||
    (node.type === 'ExpressionStatement' && node.loc!.end.line > node.loc!.start.line);

  function visit(node: Node) {
    const statements = ['Program', 'BlockStatement', 'ClassBody'].includes(node.type)
      ? node.body
      : node.type === 'SwitchCase'
        ? node.consequent
        : undefined;

    if (Array.isArray(statements)) {
      for (let i = 1; i < statements.length; i++) {
        const previous = statements[i - 1] as Node;
        const current = statements[i] as Node;
        const a = kind(previous);
        const b = kind(current);
        const importBoundary = (a === 'ImportDeclaration') !== (b === 'ImportDeclaration');
        const variableBoundary = (a === 'VariableDeclaration') !== (b === 'VariableDeclaration');

        if (!(importBoundary || variableBoundary || isSection(previous) || isSection(current)))
          continue;

        const start =
          current.leadingComments?.find((comment) => comment.start > previous.end)?.start ??
          current.start;
        const lineStart = source.lastIndexOf('\n', start - 1) + 1;
        const gap = source.slice(previous.end, lineStart);

        if (lineStart > previous.end && !/\n\s*\n/.test(gap)) insertions.add(lineStart);
      }
    }

    for (const [key, value] of Object.entries(node)) {
      if (
        [
          'loc',
          'tokens',
          'comments',
          'leadingComments',
          'trailingComments',
          'innerComments',
        ].includes(key)
      )
        continue;

      if (Array.isArray(value)) {
        for (const child of value)
          if (child && typeof child === 'object' && 'type' in child) visit(child as Node);
      } else if (value && typeof value === 'object' && 'type' in value) visit(value as Node);
    }
  }

  visit(ast);

  for (const position of [...insertions].sort((a, b) => b - a)) {
    source = source.slice(0, position) + '\n' + source.slice(position);
  }

  return source;
}

const check = process.argv.includes('--check');
const git = Bun.spawn(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
  stdout: 'pipe',
  stderr: 'inherit',
});
const paths = [...new Set((await new Response(git.stdout).text()).split('\0').filter(Boolean))];

if (await git.exited) throw new Error('Unable to enumerate project files.');

let changed = 0;

for (const path of paths) {
  try {
    await access(path);
  } catch {
    continue; // Tracked deletions are not formatting candidates.
  }

  const info = await prettier.getFileInfo(path, { ignorePath: '.prettierignore' });

  if (info.ignored || !info.inferredParser) continue;

  const original = await readFile(path, 'utf8');
  let formatted = await prettier.format(original, {
    ...(await prettier.resolveConfig(path)),
    filepath: path,
  });

  if (/\.[cm]?[jt]sx?$/.test(path)) formatted = separateSections(formatted);

  if (path.endsWith('.css')) formatted = formatted.replace(/}\n(?=[ \t]*[^\s}])/g, '}\n\n');

  if (original === formatted) continue;

  changed++;
  console.log(`${check ? 'Needs formatting' : 'Formatted'}: ${path}`);

  if (!check) await writeFile(path, formatted);
}

console.log(
  check
    ? changed
      ? `${changed} files need formatting.`
      : 'All project files are formatted.'
    : `Formatted ${changed} files.`,
);

if (check && changed) process.exitCode = 1;
