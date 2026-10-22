import type { AuthContext, Todo, TodoBadge, TodoBox, TodoChecklistItem } from '@core/shared';
import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';

export interface NewTodoInput {
  title: string;
  note?: string | null;
  assigneeId: string;
  dueAt?: string | null;
  priority?: 'normal' | 'urgent';
  checklist?: string[];
}

export interface UpdateTodoInput {
  title?: string;
  note?: string | null;
  dueAt?: string | null;
  priority?: 'normal' | 'urgent';
  checklist?: TodoChecklistItem[] | null;
  deleted?: boolean;
}

export interface TodoListFilters {
  box: TodoBox;
}

export interface TodoListResult {
  data: Todo[];
  badge: TodoBadge;
}

export type TodoAssignedNotifier = (todo: Todo) => Promise<void>;

export interface TodoDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
}

export interface TodosService {
  list(filters: TodoListFilters, actor: AuthContext): Promise<TodoListResult>;
  create(input: NewTodoInput, actor: AuthContext): Promise<Todo>;
  update(id: string, patch: UpdateTodoInput, actor: AuthContext): Promise<Todo>;
  complete(id: string, actor: AuthContext): Promise<Todo>;
  addChecklistItem(id: string, text: string, actor: AuthContext): Promise<Todo>;
  toggleChecklistItem(id: string, index: number, done: boolean, actor: AuthContext): Promise<Todo>;
  setNotifier(notifier: TodoAssignedNotifier): void;
}
