/**
 * Typed re-export bridge to the Pi todo extension.
 *
 * The CLI imports all todo storage/logic functions from this module. The
 * real implementation lives in ../extensions/todo.ts (a verbatim copy of
 * the Pi extension, marked `@ts-nocheck` so pearls doesn't attempt to
 * type-check upstream code). Here we describe the subset of exports the
 * CLI uses with pearls-local types — in particular a narrowed
 * CliExtensionContextLike that only declares the fields todo.ts actually
 * reads when driven from the CLI (no UI, stub session manager).
 *
 * No behaviour is added or changed; everything is a straight re-export of
 * a function that already exists in extensions/todo.ts.
 */
import * as todo from "../extensions/todo.js";

export interface TodoFrontMatter {
	id: string;
	title: string;
	tags: string[];
	status: string;
	created_at: string;
	assigned_to_session?: string;
	priority?: number;
	parent?: string;
}

export interface TodoRecord extends TodoFrontMatter {
	body: string;
}

export interface CliExtensionContextLike {
	cwd: string;
	hasUI: boolean;
	sessionManager: {
		getSessionId(): string;
		getSessionFile(): string;
	};
}

type ResultOrError<T> = T | { error: string };

export const formatTodoId: (id: string) => string = todo.formatTodoId;
export const validateTodoId: (
	id: string,
) => { id: string } | { error: string } = todo.validateTodoId;
export const validatePriority: (priority: number) => string | null =
	todo.validatePriority;
export const clearAssignmentIfClosed: (t: TodoFrontMatter) => void =
	todo.clearAssignmentIfClosed;

export const getTodosDir: (cwd: string) => string = todo.getTodosDir;
export const getTodoPath: (todosDir: string, id: string) => string =
	todo.getTodoPath;

export const ensureTodosDir: (todosDir: string) => Promise<void> =
	todo.ensureTodosDir;
export const readTodoSettings: (
	todosDir: string,
) => Promise<{ gc: boolean; gcDays: number }> = todo.readTodoSettings;
export const garbageCollectTodos: (
	todosDir: string,
	settings: { gc: boolean; gcDays: number },
) => Promise<void> = todo.garbageCollectTodos;

export const writeTodoFile: (
	filePath: string,
	t: TodoRecord,
) => Promise<void> = todo.writeTodoFile;
export const generateTodoId: (todosDir: string) => Promise<string> =
	todo.generateTodoId;

export const withTodoLock: <T>(
	todosDir: string,
	id: string,
	ctx: CliExtensionContextLike,
	fn: () => Promise<T>,
) => Promise<ResultOrError<T>> = todo.withTodoLock as never;

export const listTodos: (todosDir: string) => Promise<TodoFrontMatter[]> =
	todo.listTodos;
export const filterTodos: (
	todos: TodoFrontMatter[],
	query: string,
) => TodoFrontMatter[] = todo.filterTodos;
export const splitTodosByAssignment: (todos: TodoFrontMatter[]) => {
	assignedTodos: TodoFrontMatter[];
	openTodos: TodoFrontMatter[];
	closedTodos: TodoFrontMatter[];
} = todo.splitTodosByAssignment;
export const formatTodoList: (todos: TodoFrontMatter[], allTodos?: TodoFrontMatter[]) => string =
	todo.formatTodoList;
export const serializeTodoForAgent: (t: TodoRecord) => string =
	todo.serializeTodoForAgent;
export const serializeTodoListForAgent: (
	todos: TodoFrontMatter[],
) => string = todo.serializeTodoListForAgent;

export const ensureTodoExists: (
	filePath: string,
	id: string,
) => Promise<TodoRecord | null> = todo.ensureTodoExists;
export const appendTodoBody: (
	filePath: string,
	t: TodoRecord,
	text: string,
) => Promise<TodoRecord> = todo.appendTodoBody;

export const updateTodoStatus: (
	todosDir: string,
	id: string,
	status: string,
	ctx: CliExtensionContextLike,
) => Promise<ResultOrError<TodoRecord>> = todo.updateTodoStatus as never;
export const claimTodoAssignment: (
	todosDir: string,
	id: string,
	ctx: CliExtensionContextLike,
	force?: boolean,
) => Promise<ResultOrError<TodoRecord>> = todo.claimTodoAssignment as never;
export const releaseTodoAssignment: (
	todosDir: string,
	id: string,
	ctx: CliExtensionContextLike,
	force?: boolean,
) => Promise<ResultOrError<TodoRecord>> = todo.releaseTodoAssignment as never;
export const deleteTodo: (
	todosDir: string,
	id: string,
	ctx: CliExtensionContextLike,
) => Promise<ResultOrError<TodoRecord>> = todo.deleteTodo as never;
