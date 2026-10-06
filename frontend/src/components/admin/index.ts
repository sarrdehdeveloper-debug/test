/**
 * Shared dashboard components. Import from "@/components/admin":
 *   import { PageHeader, Panel, DataTable, Pagination, StatusBadge } from "@/components/admin";
 * Data helpers live in "@/lib/admin/*" (api, hooks, types, format, errors, toast).
 */
export { AdminAuthProvider, RequireRole, useAdminAuth } from "./AdminAuthProvider";
export type { AdminAuthContextValue, AdminAuthStatus } from "./AdminAuthProvider";
export { AdminButton, AdminButtonLink, adminButtonClasses } from "./AdminButton";
export type {
  AdminButtonProps,
  AdminButtonLinkProps,
  AdminButtonVariant,
  AdminButtonSize,
} from "./AdminButton";
export { AdminLogo } from "./AdminLogo";
export { AdminShell } from "./AdminShell";
export { ComingSoon } from "./ComingSoon";
export { ConfirmDialog } from "./ConfirmDialog";
export type { ConfirmDialogProps } from "./ConfirmDialog";
export { CopyButton } from "./CopyButton";
export { DataTable } from "./DataTable";
export type { DataTableColumn, DataTableProps } from "./DataTable";
export { DateTimeInput } from "./DateTimeInput";
export { EmptyState } from "./EmptyState";
export {
  adminControlClasses,
  CheckboxInput,
  Field,
  FieldError,
  SelectInput,
  Switch,
  TextArea,
  TextInput,
} from "./form";
export { FormSection } from "./FormSection";
export { Icon } from "./icons";
export type { IconName } from "./icons";
export { ImagePicker, MediaLibraryDialog, useImageUpload } from "./ImagePicker";
export { JsonPreview } from "./JsonPreview";
export { KeyValueList } from "./KeyValueList";
export type { KeyValueItem } from "./KeyValueList";
export { MarkdownEditor } from "./MarkdownEditor";
export type { MarkdownView } from "./MarkdownEditor";
export { Modal } from "./Modal";
export { MoneyInput } from "./MoneyInput";
export { PageHeader } from "./PageHeader";
export type { Breadcrumb } from "./PageHeader";
export { Pagination } from "./Pagination";
export { Panel } from "./Panel";
export { QrCode } from "./QrCode";
export { ErrorState, ForbiddenState, LoadingState, Skeleton } from "./QueryState";
export { StatCard } from "./StatCard";
export { Badge, StatusBadge, statusStyle } from "./StatusBadge";
export type { BadgeTone, StatusKind } from "./StatusBadge";
export { Toaster } from "./Toaster";
export { FilterBar, FilterSelect, SearchInput, Toolbar } from "./Toolbar";
export { TranslationTabs } from "./TranslationTabs";
export type { TranslationTabContext } from "./TranslationTabs";
