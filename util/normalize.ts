import { ItemStatus, ItemPriority, DecisionStatus, DocumentStatus } from "../types";
import { DEFAULT_SCHEMA } from "../src/entity-core/default-schema";
import {
	normalizeStatus as normalizeStatusForType,
	normalizePriority as normalizePriorityForType,
} from "../src/entity-core/status-normalizer";

/**
 * Normalize status values to the schema's canonical vocabulary for the entity type.
 *
 * refactor §7: this is now SCHEMA-DRIVEN — it delegates to entity-core's
 * status-normalizer using DEFAULT_SCHEMA. That fixes the feature-status bug:
 * features use Planned/In Progress/Complete/Deferred (previously they fell
 * through to the task branch and mis-mapped). The exported signature is
 * unchanged so main.ts is untouched.
 *
 * When `entityType` is omitted, the standard (task/milestone/story) vocabulary
 * is used — matching the historical default behaviour.
 */
export function normalizeStatus(
	status?: string,
	entityType?: string
): ItemStatus | DecisionStatus | DocumentStatus {
	const type = entityType || "task";
	return normalizeStatusForType(DEFAULT_SCHEMA, type, status) as
		| ItemStatus
		| DecisionStatus
		| DocumentStatus;
}

/**
 * Normalize priority values to the schema's Low/Medium/High/Critical vocabulary.
 *
 * refactor §7: schema-driven — delegates to entity-core using the `priority`
 * enum field defined on the entity type. Signature preserved for main.ts.
 */
export function normalizePriority(priority?: string): ItemPriority {
	return normalizePriorityForType(DEFAULT_SCHEMA, "task", priority) as ItemPriority;
}
