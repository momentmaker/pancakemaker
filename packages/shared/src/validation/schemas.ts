import { z } from 'zod'

const uuid = z.string().uuid()
const timestamp = z.string().datetime()
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const currencyCode = z.string().length(3).toUpperCase()

export const userSchema = z.object({
  id: uuid,
  email: z.string().email(),
  base_currency: currencyCode,
  created_at: timestamp,
  updated_at: timestamp,
})

export const routeTypeSchema = z.enum(['personal', 'business'])

export const routeSchema = z.object({
  id: uuid,
  user_id: uuid,
  type: routeTypeSchema,
  created_at: timestamp,
  updated_at: timestamp,
})

export const categorySchema = z.object({
  id: uuid,
  route_id: uuid,
  name: z.string().min(1).max(50),
  color: hexColor,
  sort_order: z.number().int().nonnegative(),
  created_at: timestamp,
  updated_at: timestamp,
})

export const recurrenceTypeSchema = z.enum(['monthly', 'annual'])

export const panelSchema = z.object({
  id: uuid,
  route_id: uuid,
  name: z.string().min(1).max(100),
  currency: currencyCode,
  sort_order: z.number().int().nonnegative(),
  recurrence_type: recurrenceTypeSchema.nullable().default(null),
  is_default: z.boolean().default(false),
  is_archived: z.boolean().default(false),
  created_at: timestamp,
  updated_at: timestamp,
})

export const expenseSchema = z.object({
  id: uuid,
  panel_id: uuid,
  category_id: uuid,
  amount: z.number().int(),
  currency: currencyCode,
  description: z.string().max(500).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  is_recurring: z.boolean().default(false),
  recurrence_type: recurrenceTypeSchema.nullable().default(null),
  recurrence_end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  recurrence_day: z.number().int().min(1).max(28).nullable().default(null),
  source_expense_id: uuid.nullable().default(null),
  created_at: timestamp,
  updated_at: timestamp,
  deleted_at: timestamp.nullable().default(null),
})

export const tagSchema = z.object({
  id: uuid,
  user_id: uuid,
  name: z.string().min(1).max(50),
  created_at: timestamp,
})

export const expenseTagSchema = z.object({
  expense_id: uuid,
  tag_id: uuid,
})

export const exchangeRateSchema = z.object({
  id: z.string(),
  base_currency: currencyCode,
  target_currency: currencyCode,
  rate: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fetched_at: timestamp,
})

export const syncActionSchema = z.enum(['create', 'update', 'delete'])

export const syncLogSchema = z.object({
  id: z.string(),
  user_id: uuid,
  table_name: z.string(),
  record_id: z.string(),
  action: syncActionSchema,
  payload: z.string(),
  local_timestamp: timestamp,
  synced_at: timestamp.nullable().default(null),
})

export const createExpenseSchema = expenseSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
})

export const updateExpenseSchema = createExpenseSchema.partial().extend({
  id: uuid,
})
