# Issue tracking

This project uses [Moth](https://github.com/nikolasgioannou/moth). The Homebrew-installed `moth` command reads `moth.config.yml` and stores tickets as Markdown files in `.moth/`. Tickets are committed with the code; no server or app runtime dependency is needed.

Run commands from the project directory:

```sh
moth new "Fix a bug" --priority high
moth list
moth list --unblocked
moth show <ticket-id>
moth move <ticket-id> in-progress
moth move <ticket-id> done
moth board
moth check
```

Statuses are `backlog`, `todo`, `in-progress`, `done`, `canceled` and `duplicate`. Run `moth schema --json` for the schema, or `moth <command> --help` for options. The tracker starts empty; add actual work as needed. Keep secrets and private player content out of tickets.
