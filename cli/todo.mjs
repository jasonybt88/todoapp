import { pathToFileURL } from "node:url";
import { createTodoClient } from "./client.mjs";

const recurrencePatterns = new Set(["daily", "weekly", "monthly", "yearly"]);

function requiredValue(argumentsList, index, option) {
  const value = argumentsList[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function requiredId(value, name) {
  if (!/^[1-9]\d*$/.test(value ?? "")) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function parseTagOptions(options, allowedOptions) {
  const input = {};
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (!allowedOptions.includes(option)) {
      throw new Error(`Unknown option: ${option}`);
    }
    input[option.slice(2) === "name" ? "name" : "color"] =
      requiredValue(options, index, option);
    index += 1;
  }
  return input;
}

export function parseCommand(argumentsList) {
  const [command, ...args] = argumentsList;

  if (command === "tags" && args[0] === "list" && args.length === 1) {
    return { command, action: "list" };
  }
  if (command === "tags" && args[0] === "create" && args.length >= 2) {
    const input = { name: args[1] };
    Object.assign(input, parseTagOptions(args.slice(2), ["--color"]));
    return { command, action: "create", input };
  }
  if (command === "tags" && args[0] === "update" && args.length >= 2) {
    const id = requiredId(args[1], "Tag ID");
    const input = parseTagOptions(args.slice(2), ["--name", "--color"]);
    if (Object.keys(input).length === 0) {
      throw new Error("Provide --name or --color to update a tag.");
    }
    return { command, action: "update", id, input };
  }
  if (command === "tags" && args[0] === "delete" && args.length === 2) {
    return { command, action: "delete", id: requiredId(args[1], "Tag ID") };
  }
  if (
    command === "tags" &&
    (args[0] === "attach" || args[0] === "detach") &&
    args.length === 3
  ) {
    return {
      command,
      action: args[0],
      todoId: requiredId(args[1], "Todo ID"),
      tagId: requiredId(args[2], "Tag ID"),
    };
  }

  if (command === "list" && args.length === 0) {
    return { command };
  }
  if (command === "get" && args.length === 1) {
    return { command, id: args[0] };
  }
  if (command === "delete" && args.length === 1) {
    return { command, id: args[0] };
  }

  if (command === "create" && args.length >= 1) {
    const [title, ...options] = args;
    const input = { title };
    for (let index = 0; index < options.length; index += 1) {
      const option = options[index];
      if (option === "--priority") {
        input.priority = requiredValue(options, index, option);
        index += 1;
      } else if (option === "--due-date") {
        input.due_date = requiredValue(options, index, option);
        index += 1;
      } else if (option === "--repeat") {
        const pattern = requiredValue(options, index, option);
        if (!recurrencePatterns.has(pattern)) {
          throw new Error("--repeat must be daily, weekly, monthly, or yearly.");
        }
        input.is_recurring = true;
        input.recurrence_pattern = pattern;
        index += 1;
      } else {
        throw new Error(`Unknown option: ${option}`);
      }
    }
    if (input.is_recurring && !input.due_date) {
      throw new Error("Recurring todos require --due-date.");
    }
    return { command, input };
  }

  if (command === "update" && args.length >= 1) {
    const [id, ...options] = args;
    const input = {};
    for (let index = 0; index < options.length; index += 1) {
      const option = options[index];
      if (option === "--title") {
        input.title = requiredValue(options, index, option);
        index += 1;
      } else if (option === "--priority") {
        input.priority = requiredValue(options, index, option);
        index += 1;
      } else if (option === "--due-date") {
        const value = requiredValue(options, index, option);
        input.due_date = value === "none" ? null : value;
        index += 1;
      } else if (option === "--repeat") {
        const pattern = requiredValue(options, index, option);
        if (!recurrencePatterns.has(pattern)) {
          throw new Error("--repeat must be daily, weekly, monthly, or yearly.");
        }
        input.is_recurring = true;
        input.recurrence_pattern = pattern;
        index += 1;
      } else if (option === "--no-repeat") {
        input.is_recurring = false;
        input.recurrence_pattern = null;
      } else if (option === "--completed") {
        const value = requiredValue(options, index, option);
        if (value !== "true" && value !== "false") {
          throw new Error("--completed must be true or false.");
        }
        input.completed = value === "true";
        index += 1;
      } else {
        throw new Error(`Unknown option: ${option}`);
      }
    }
    if (Object.keys(input).length === 0) {
      throw new Error("Provide at least one field to update.");
    }
    return { command, id, input };
  }

  throw new Error(
    "Usage: node cli/todo.mjs list | get <id> | create <title> [--priority high|medium|low] [--due-date ISO] [--repeat daily|weekly|monthly|yearly] | update <id> [--title text] [--priority value] [--due-date ISO|none] [--repeat pattern|--no-repeat] [--completed true|false] | delete <id> | tags list | tags create <name> [--color #RRGGBB] | tags update <id> [--name text] [--color #RRGGBB] | tags delete <id> | tags attach <todoId> <tagId> | tags detach <todoId> <tagId>",
  );
}

export async function executeCommand(parsed, client) {
  switch (parsed.command) {
    case "list":
      return client.list();
    case "get":
      return client.get(parsed.id);
    case "create":
      return client.create(parsed.input);
    case "update":
      return client.update(parsed.id, parsed.input);
    case "delete":
      return client.delete(parsed.id);
    case "tags":
      switch (parsed.action) {
        case "list":
          return client.listTags();
        case "create":
          return client.createTag(parsed.input);
        case "update":
          return client.updateTag(parsed.id, parsed.input);
        case "delete":
          return client.deleteTag(parsed.id);
        case "attach":
          return client.attachTag(parsed.todoId, parsed.tagId);
        case "detach":
          return client.detachTag(parsed.todoId, parsed.tagId);
        default:
          throw new Error("Unknown tag command.");
      }
    default:
      throw new Error("Unknown command.");
  }
}

async function main() {
  const parsed = parseCommand(process.argv.slice(2));
  const client = createTodoClient();
  const result = await executeCommand(parsed, client);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "The command failed."}\n`,
    );
    process.exitCode = 1;
  });
}
