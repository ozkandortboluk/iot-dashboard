import { CodexControlPanel } from './ui/CodexControlPanel';
import { ADMIN_PLUGINS_TAB_ID, ADMIN_PLUGINS_TAB_LABEL } from './pluginMetadata';

/** Single admin navigation registration point for the optional plugin section. */
export const ADMIN_PLUGINS_TAB = {
  id: ADMIN_PLUGINS_TAB_ID,
  label: ADMIN_PLUGINS_TAB_LABEL,
  component: CodexControlPanel,
} as const;
