import { z } from 'zod'
import {
  userSchema,
  routeSchema,
  routeTypeSchema,
  categorySchema,
  panelSchema,
  expenseSchema,
  recurrenceTypeSchema,
  tagSchema,
  expenseTagSchema,
  exchangeRateSchema,
  syncLogSchema,
  syncActionSchema,
  createExpenseSchema,
  updateExpenseSchema,
} from '../validation/schemas.js'

export type User = z.infer<typeof userSchema>
export type Route = z.infer<typeof routeSchema>
export type RouteType = z.infer<typeof routeTypeSchema>
export type Category = z.infer<typeof categorySchema>
export type Panel = z.infer<typeof panelSchema>
export type Expense = z.infer<typeof expenseSchema>
export type RecurrenceType = z.infer<typeof recurrenceTypeSchema>
export type Tag = z.infer<typeof tagSchema>
export type ExpenseTag = z.infer<typeof expenseTagSchema>
export type ExchangeRate = z.infer<typeof exchangeRateSchema>
export type SyncLog = z.infer<typeof syncLogSchema>
export type SyncAction = z.infer<typeof syncActionSchema>
export type CreateExpense = z.infer<typeof createExpenseSchema>
export type UpdateExpense = z.infer<typeof updateExpenseSchema>
