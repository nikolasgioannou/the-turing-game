export async function withDeadline<T>(task: Promise<T>, milliseconds = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Dependency timed out')), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
