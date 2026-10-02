// Built from the Mixpanel OpenAPI specifications: 106 operations across 21 resources.
// https://github.com/mixpanel/docs/tree/main/openapi

import {
	ICredentialTestFunctions,
	ICredentialsDecrypted,
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	INode,
	INodeCredentialTestResult,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
} from 'n8n-workflow';

// Mixpanel spreads its APIs over five hosts, each with one variant per data residency
// region. Which region is used comes from the credential.
const HOSTS: Record<string, Record<string, string>> = {
	app: {
		us: 'https://mixpanel.com/api/app',
		eu: 'https://eu.mixpanel.com/api/app',
		in: 'https://in.mixpanel.com/api/app',
	},
	query: {
		us: 'https://mixpanel.com/api/query',
		eu: 'https://eu.mixpanel.com/api/query',
		in: 'https://in.mixpanel.com/api/query',
	},
	ingestion: {
		us: 'https://api.mixpanel.com',
		eu: 'https://api-eu.mixpanel.com',
		in: 'https://api-in.mixpanel.com',
	},
	data: {
		us: 'https://data.mixpanel.com/api/2.0',
		eu: 'https://data-eu.mixpanel.com/api/2.0',
		in: 'https://data-in.mixpanel.com/api/2.0',
	},
	platform: {
		us: 'https://platform-us.mixpanel.com',
		eu: 'https://platform-eu.mixpanel.com',
		in: 'https://platform-in.mixpanel.com',
	},
};

// Query parameters Mixpanel reads as 1/0 rather than true/false.
const NUMERIC_FLAGS = new Set<string>(['ip', 'strict', 'verbose']);

// Operations that take project_id in the query string when authenticated with a service account.
const PROJECT_ID_QUERY = new Set<string>([
	'evaluateFeatureFlagsGet',
	'exportEventsGet',
	'getEventCountsGet',
	'getEventPropertyValuesGet',
	'getFeatureFlagDefinitionsGet',
	'getFrequencyReportGet',
	'getFunnelReportGet',
	'getInsightsReportGet',
	'getNumericAverageGet',
	'getNumericBucketsGet',
	'getNumericSumGet',
	'getPipelineGet',
	'getProfileActivityGet',
	'getRetentionReportGet',
	'getSegmentationReportGet',
	'getTodayTopEventsGet',
	'getTopEventNamesGet',
	'getTopEventPropertiesGet',
	'getTopPropertyValuesGet',
	'importEventsPost',
	'listCohortsPost',
	'listFunnelsGet',
	'listLookupTablesGet',
	'listPipelineLogsGet',
	'listPipelinesGet',
	'mergeIdentitiesPost',
	'queryProfilesPost',
	'replaceLookupTablePut',
	'runJqlQueryPost',
]);

// Data pipeline operations, which take project_id in the form body instead.
const PROJECT_ID_FORM = new Set<string>([
	'createPipelinePost',
	'deletePipelinePost',
	'editPipelinePost',
	'pausePipelinePost',
	'resumePipelinePost',
]);

// Operations that take the project token in the query string.
const TOKEN_QUERY = new Set<string>([
	'cancelDeletionDelete',
	'createDeletionPost',
	'createRetrievalPost',
	'evaluateFeatureFlagsGet',
	'getDeletionGet',
	'getFeatureFlagDefinitionsGet',
	'getRetrievalGet',
]);

// Of those, the ones Mixpanel cannot answer without it.
const TOKEN_REQUIRED = new Set<string>([
	'cancelDeletionDelete',
	'createDeletionPost',
	'createRetrievalPost',
	'getDeletionGet',
	'getRetrievalGet',
]);

// Ingestion operations authenticated by the project token inside each record rather than by the credential.
const TOKEN_AUTH = new Set<string>([
	'appendToListPost',
	'batchUpdateGroupProfilesPost',
	'batchUpdateProfilesPost',
	'createAliasPost',
	'createIdentityPost',
	'deleteGroupProfilePost',
	'deleteProfilePost',
	'incrementPropertiesPost',
	'removeFromGroupListPost',
	'removeFromListPost',
	'setGroupPropertiesOncePost',
	'setGroupPropertiesPost',
	'setPropertiesOncePost',
	'setPropertiesPost',
	'trackEventsPost',
	'unionToGroupListPost',
	'unionToListPost',
	'unsetGroupPropertiesPost',
	'unsetPropertiesPost',
]);

// Operations sent as application/x-www-form-urlencoded, one form field per key of the JSON body.
const FORM_BODY = new Set<string>([
	'createPipelinePost',
	'deletePipelinePost',
	'editPipelinePost',
	'pausePipelinePost',
	'queryProfilesPost',
	'resumePipelinePost',
	'runJqlQueryPost',
]);

// Operations sent as a single "data" form field holding the JSON event.
const FORM_DATA_BODY = new Set<string>([
	'createAliasPost',
	'createIdentityPost',
]);

// Operations for which strict=1 is sent unless the user sets Strict, so that invalid records are reported.
const STRICT_BY_DEFAULT = new Set<string>([
	'importEventsPost',
	'mergeIdentitiesPost',
]);

// Query parameters the API cannot answer without, checked before the call.
const REQUIRED_QUERY: Record<string, string[]> = {
	evaluateFeatureFlagsGet: ['context'],
	exportEventsGet: ['from_date', 'to_date'],
	getEventCountsGet: ['event', 'type', 'unit', 'from_date', 'to_date'],
	getEventPropertyValuesGet: ['event', 'name', 'type', 'unit', 'from_date', 'to_date'],
	getFrequencyReportGet: ['from_date', 'to_date', 'unit', 'addiction_unit'],
	getFunnelReportGet: ['funnel_id', 'from_date', 'to_date'],
	getInsightsReportGet: ['bookmark_id'],
	getNumericAverageGet: ['event', 'from_date', 'to_date', 'on'],
	getNumericBucketsGet: ['event', 'from_date', 'to_date', 'on'],
	getNumericSumGet: ['event', 'from_date', 'to_date', 'on'],
	getPipelineGet: ['name'],
	getProfileActivityGet: ['distinct_ids', 'from_date', 'to_date'],
	getRetentionReportGet: ['from_date', 'to_date'],
	getSegmentationReportGet: ['event', 'from_date', 'to_date'],
	getTodayTopEventsGet: ['type'],
	getTopEventNamesGet: ['type'],
	getTopEventPropertiesGet: ['event'],
	getTopPropertyValuesGet: ['event', 'name'],
};

export class Mixpanel implements INodeType {
	description: INodeTypeDescription = {
		name: 'mixpanel',
		displayName: 'Mixpanel',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["resource"] + " → " + $parameter["operation"]}}',
		description: 'Use the Mixpanel API',
		defaults: { name: 'Mixpanel' },
		icon: { light: 'file:mixpanel.svg', dark: 'file:mixpanel.dark.svg' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'mixpanelServiceAccountApi',
				required: true,
				displayOptions: { show: { authentication: ['serviceAccount'] }, hide: { resource: ['gdpr'] } },
			},
			{
				name: 'mixpanelProjectSecretApi',
				required: true,
				displayOptions: { show: { authentication: ['projectSecret'] }, hide: { resource: ['gdpr'] } },
			},
			{
				name: 'mixpanelGdprApi',
				required: true,
				testedBy: 'mixpanelGdprApiTest',
				displayOptions: { show: { resource: ['gdpr'] } },
			},
		],
		properties: [
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Service Account', value: 'serviceAccount' },
					{ name: 'Project Secret', value: 'projectSecret' },
				],
				default: 'serviceAccount',
				displayOptions: { hide: { resource: ['gdpr'] } },
				description: 'Service accounts are the method Mixpanel recommends and the only one accepted by the management APIs. GDPR operations always use the GDPR credential.',
			},
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Annotation',
						value: 'annotation',
						description: 'Notes pinned to a date on the project charts',
					},
					{
						name: 'Audit Log',
						value: 'auditLog',
						description: 'Organization audit trail (Enterprise plan)',
					},
					{
						name: 'Cohort',
						value: 'cohort',
						description: 'Saved cohorts of the project',
					},
					{
						name: 'Data Pipeline',
						value: 'dataPipeline',
						description: 'Scheduled exports of raw or schematized data to a warehouse or bucket (paid add-on)',
					},
					{
						name: 'Event',
						value: 'event',
						description: 'Send events to Mixpanel and download raw events',
					},
					{
						name: 'Event Breakdown',
						value: 'eventBreakdown',
						description: 'Aggregated event counts, top events and top property values',
					},
					{
						name: 'Experiment',
						value: 'experiment',
						description: 'Experiments: creation, launch, decision and archiving',
					},
					{
						name: 'Feature Flag',
						value: 'featureFlag',
						description: 'Manage feature flags and evaluate them for a user',
					},
					{
						name: 'Funnel',
						value: 'funnel',
						description: 'Saved funnels and their conversion data',
					},
					{
						name: 'GDPR',
						value: 'gdpr',
						description: 'Data retrieval and deletion requests for data subjects',
					},
					{
						name: 'Group Profile',
						value: 'groupProfile',
						description: 'Create, update and delete group profiles',
					},
					{
						name: 'Identity',
						value: 'identity',
						description: 'Link anonymous and identified IDs (legacy ID management)',
					},
					{
						name: 'Insight',
						value: 'insight',
						description: 'Data of a saved Insights report',
					},
					{
						name: 'JQL',
						value: 'jql',
						description: 'Run a custom JQL script (maintenance mode)',
					},
					{
						name: 'Lexicon Schema',
						value: 'lexiconSchema',
						description: 'Event and profile property schemas of the Lexicon',
					},
					{
						name: 'Lookup Table',
						value: 'lookupTable',
						description: 'List and replace lookup tables',
					},
					{
						name: 'Retention',
						value: 'retention',
						description: 'Retention and frequency reports',
					},
					{
						name: 'Segmentation',
						value: 'segmentation',
						description: 'Event segmentation reports',
					},
					{
						name: 'Service Account',
						value: 'serviceAccount',
						description: 'Service accounts of the organization and their project membership',
					},
					{
						name: 'User Profile',
						value: 'userProfile',
						description: 'Create, update, query and delete user profiles',
					},
					{
						name: 'Warehouse Import',
						value: 'warehouseImport',
						description: 'Warehouse connectors that import events, profiles and lookup tables from a warehouse',
					},
				],
				default: 'annotation',
				required: true,
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['annotation'] } },
				options: [
					{
						name: 'Create an Annotation',
						value: 'createAnnotationPost',
						action: 'Create an annotation',
						description: 'Creates an annotation. Requires a role of at least Analyst.',
					},
					{
						name: 'Create an Annotation Tag',
						value: 'createAnnotationTagPost',
						action: 'Create an annotation tag',
						description: 'Creates an annotation tag with the given name',
					},
					{
						name: 'Delete an Annotation',
						value: 'deleteAnnotationDelete',
						action: 'Delete an annotation',
						description: 'Deletes an annotation. Requires a role of at least Analyst.',
					},
					{
						name: 'Get an Annotation',
						value: 'getAnnotationGet',
						action: 'Get an annotation',
						description: 'Returns a single annotation by ID',
					},
					{
						name: 'List Annotation Tags',
						value: 'listAnnotationTagsGet',
						action: 'List annotation tags',
						description: 'Returns all tags used by at least one annotation',
					},
					{
						name: 'List Annotations',
						value: 'listAnnotationsGet',
						action: 'List annotations',
						description: 'Lists all annotations of the project, optionally between two dates',
					},
					{
						name: 'Update an Annotation',
						value: 'updateAnnotationPatch',
						action: 'Update an annotation',
						description: 'Partially updates an annotation. Requires a role of at least Analyst.',
					},
				],
				default: 'createAnnotationPost',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['auditLog'] } },
				options: [
					{
						name: 'Query Audit Logs',
						value: 'queryAuditLogsPost',
						action: 'Query audit logs',
						description: 'Queries the audit logs of an organization, with cursor-based pagination',
					},
				],
				default: 'queryAuditLogsPost',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['cohort'] } },
				options: [
					{
						name: 'List Cohorts',
						value: 'listCohortsPost',
						action: 'List cohorts',
						description: 'Returns all saved cohorts of the project with their name, ID, count, description, creation date and visibility',
					},
				],
				default: 'listCohortsPost',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['dataPipeline'] } },
				options: [
					{
						name: 'Create a Pipeline',
						value: 'createPipelinePost',
						action: 'Create a pipeline',
						description: 'Creates an export pipeline. The type field (gcs-raw, s3-raw, azure-raw, bigquery, snowflake, aws, azure-blob, gcs-schema) decides the other required fields.',
					},
					{
						name: 'Delete a Pipeline',
						value: 'deletePipelinePost',
						action: 'Delete a pipeline',
						description: 'Deletes a pipeline and stops its future jobs. Its historical data is lost: pause it instead to keep it.',
					},
					{
						name: 'Edit a Pipeline',
						value: 'editPipelinePost',
						action: 'Edit a pipeline',
						description: 'Edits the parameters of an export pipeline',
					},
					{
						name: 'Get a Pipeline',
						value: 'getPipelineGet',
						action: 'Get a pipeline',
						description: 'Returns the status of a pipeline and its tasks',
					},
					{
						name: 'List Pipeline Logs',
						value: 'listPipelineLogsGet',
						action: 'List pipeline logs',
						description: 'Returns the timestamps of all syncs of a pipeline, grouped by date',
					},
					{
						name: 'List Pipelines',
						value: 'listPipelinesGet',
						action: 'List pipelines',
						description: 'Returns all the pipelines scheduled for the project',
					},
					{
						name: 'Pause a Pipeline',
						value: 'pausePipelinePost',
						action: 'Pause a pipeline',
						description: 'Pauses a pipeline: stops the ongoing jobs and prevents new ones from being scheduled',
					},
					{
						name: 'Resume a Pipeline',
						value: 'resumePipelinePost',
						action: 'Resume a pipeline',
						description: 'Resumes a paused pipeline',
					},
				],
				default: 'createPipelinePost',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['event'] } },
				options: [
					{
						name: 'Export Events',
						value: 'exportEventsGet',
						action: 'Export events',
						description: 'Downloads raw events as they are stored in Mixpanel, with all their properties. One output item per event.',
					},
					{
						name: 'Import Events',
						value: 'importEventsPost',
						action: 'Import events',
						description: 'Sends a batch of up to 2000 events, including events older than 5 days. Authenticated by the credential.',
					},
					{
						name: 'Track Events',
						value: 'trackEventsPost',
						action: 'Track events',
						description: 'Sends events from the last 5 days, authenticated by the project token. Prefer Import Events for server-side or historical data.',
					},
				],
				default: 'exportEventsGet',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['eventBreakdown'] } },
				options: [
					{
						name: 'Get Event Counts',
						value: 'getEventCountsGet',
						action: 'Get event counts',
						description: 'Returns unique, total or average counts for a set of events over N minutes, hours, days, weeks or months',
					},
					{
						name: 'Get Event Property Values',
						value: 'getEventPropertyValuesGet',
						action: 'Get event property values',
						description: 'Returns unique, total or average counts for one event and one property over time',
					},
					{
						name: 'Get Top Event Names',
						value: 'getTopEventNamesGet',
						action: 'Get top event names',
						description: 'Returns the most common event names over the last 31 days',
					},
					{
						name: 'Get Top Event Properties',
						value: 'getTopEventPropertiesGet',
						action: 'Get top event properties',
						description: 'Returns the top property names of an event',
					},
					{
						name: 'Get Top Events of Today',
						value: 'getTodayTopEventsGet',
						action: 'Get top events of today',
						description: 'Returns the top events of today with their counts and the normalized percent change from yesterday',
					},
					{
						name: 'Get Top Property Values',
						value: 'getTopPropertyValuesGet',
						action: 'Get top property values',
						description: 'Returns the top values of an event property',
					},
				],
				default: 'getEventCountsGet',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['experiment'] } },
				options: [
					{
						name: 'Archive an Experiment',
						value: 'archiveExperimentPost',
						action: 'Archive an experiment',
						description: 'Archives an experiment',
					},
					{
						name: 'Create an Experiment',
						value: 'createExperimentPost',
						action: 'Create an experiment',
						description: 'Creates an experiment in a workspace',
					},
					{
						name: 'Decide an Experiment',
						value: 'decideExperimentPatch',
						action: 'Decide an experiment',
						description: 'Records the decision of a concluded experiment (ship a variant or not)',
					},
					{
						name: 'Delete an Experiment',
						value: 'deleteExperimentDelete',
						action: 'Delete an experiment',
						description: 'Deletes an experiment',
					},
					{
						name: 'Force Conclude an Experiment',
						value: 'forceConcludeExperimentPut',
						action: 'Force conclude an experiment',
						description: 'Concludes a running experiment before its planned end',
					},
					{
						name: 'Get an Experiment',
						value: 'getExperimentGet',
						action: 'Get an experiment',
						description: 'Returns a single experiment by ID',
					},
					{
						name: 'Launch an Experiment',
						value: 'launchExperimentPut',
						action: 'Launch an experiment',
						description: 'Launches a draft experiment',
					},
					{
						name: 'List Experiments',
						value: 'listExperimentsGet',
						action: 'List experiments',
						description: 'Returns the experiments of a workspace',
					},
					{
						name: 'Unarchive an Experiment',
						value: 'unarchiveExperimentDelete',
						action: 'Unarchive an experiment',
						description: 'Restores an archived experiment',
					},
					{
						name: 'Update an Experiment',
						value: 'updateExperimentPatch',
						action: 'Update an experiment',
						description: 'Partially updates an experiment',
					},
				],
				default: 'archiveExperimentPost',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['featureFlag'] } },
				options: [
					{
						name: 'Create a Feature Flag',
						value: 'createFeatureFlagPost',
						action: 'Create a feature flag',
						description: 'Creates a feature flag in a workspace',
					},
					{
						name: 'Delete a Feature Flag',
						value: 'deleteFeatureFlagDelete',
						action: 'Delete a feature flag',
						description: 'Deletes a feature flag',
					},
					{
						name: 'Evaluate Feature Flags',
						value: 'evaluateFeatureFlagsGet',
						action: 'Evaluate feature flags',
						description: 'Evaluates all enabled feature flags for a user and returns the variants they are assigned',
					},
					{
						name: 'Get a Feature Flag',
						value: 'getFeatureFlagGet',
						action: 'Get a feature flag',
						description: 'Returns a single feature flag by ID',
					},
					{
						name: 'Get Feature Flag Definitions',
						value: 'getFeatureFlagDefinitionsGet',
						action: 'Get feature flag definitions',
						description: 'Returns the definitions of all enabled feature flags, with rulesets, variants and rollout',
					},
					{
						name: 'List Feature Flags',
						value: 'listFeatureFlagsGet',
						action: 'List feature flags',
						description: 'Returns the feature flags of a workspace',
					},
					{
						name: 'Update a Feature Flag',
						value: 'updateFeatureFlagPut',
						action: 'Update a feature flag',
						description: 'Replaces a feature flag',
					},
				],
				default: 'createFeatureFlagPost',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['funnel'] } },
				options: [
					{
						name: 'Get Funnel Report',
						value: 'getFunnelReportGet',
						action: 'Get funnel report',
						description: 'Returns the conversion data of a saved funnel between two dates',
					},
					{
						name: 'List Funnels',
						value: 'listFunnelsGet',
						action: 'List funnels',
						description: 'Returns the names and IDs of the saved funnels',
					},
				],
				default: 'getFunnelReportGet',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['gdpr'] } },
				options: [
					{
						name: 'Cancel a Deletion',
						value: 'cancelDeletionDelete',
						action: 'Cancel a deletion',
						description: 'Cancels a deletion job that is still in progress',
					},
					{
						name: 'Create a Deletion',
						value: 'createDeletionPost',
						action: 'Create a deletion',
						description: 'Creates a job that deletes the data of one or more users',
					},
					{
						name: 'Create a Retrieval',
						value: 'createRetrievalPost',
						action: 'Create a retrieval',
						description: 'Creates a job that retrieves the data of one or more users',
					},
					{
						name: 'Get a Deletion Status',
						value: 'getDeletionGet',
						action: 'Get a deletion status',
						description: 'Returns the status of a deletion job',
					},
					{
						name: 'Get a Retrieval Status',
						value: 'getRetrievalGet',
						action: 'Get a retrieval status',
						description: 'Returns the status of a data retrieval job',
					},
				],
				default: 'cancelDeletionDelete',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['groupProfile'] } },
				options: [
					{
						name: 'Batch Update Group Profiles',
						value: 'batchUpdateGroupProfilesPost',
						action: 'Batch update group profiles',
						description: 'Sends several group profile updates in one call, each with its own operation',
					},
					{
						name: 'Delete a Group Profile',
						value: 'deleteGroupProfilePost',
						action: 'Delete a group profile',
						description: 'Deletes a group profile ($delete)',
					},
					{
						name: 'Remove From Group List Property',
						value: 'removeFromGroupListPost',
						action: 'Remove from group list property',
						description: 'Removes a value from a list property of a group profile ($remove)',
					},
					{
						name: 'Set Group Properties',
						value: 'setGroupPropertiesPost',
						action: 'Set group properties',
						description: 'Sets properties on a group profile ($set), creating the profile if needed',
					},
					{
						name: 'Set Group Properties Once',
						value: 'setGroupPropertiesOncePost',
						action: 'Set group properties once',
						description: 'Sets properties on a group profile only when they are not set yet ($set_once)',
					},
					{
						name: 'Union to Group List Property',
						value: 'unionToGroupListPost',
						action: 'Union to group list property',
						description: 'Adds values to a list property of a group profile, without duplicates ($union)',
					},
					{
						name: 'Unset Group Properties',
						value: 'unsetGroupPropertiesPost',
						action: 'Unset group properties',
						description: 'Removes properties from a group profile ($unset)',
					},
				],
				default: 'batchUpdateGroupProfilesPost',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['identity'] } },
				options: [
					{
						name: 'Create an Alias',
						value: 'createAliasPost',
						action: 'Create an alias',
						description: 'Adds an alias to a distinct ID with a $create_alias event. Only for projects on the original ID merge API.',
					},
					{
						name: 'Create an Identity',
						value: 'createIdentityPost',
						action: 'Create an identity',
						description: 'Links an anonymous ID to an identified ID with a $identify event. Only for projects on the original ID merge API.',
					},
					{
						name: 'Merge Identities',
						value: 'mergeIdentitiesPost',
						action: 'Merge identities',
						description: 'Merges two distinct IDs with a $merge event sent to the import endpoint. Only for projects on the original ID merge API.',
					},
				],
				default: 'createAliasPost',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['insight'] } },
				options: [
					{
						name: 'Get Insights Report',
						value: 'getInsightsReportGet',
						action: 'Get insights report',
						description: 'Returns the data of a saved Insights report',
					},
				],
				default: 'getInsightsReportGet',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['jql'] } },
				options: [
					{
						name: 'Run a JQL Query',
						value: 'runJqlQueryPost',
						action: 'Run a jql query',
						description: 'Runs a custom JQL script. JQL is in maintenance mode on Mixpanel\'s side.',
					},
				],
				default: 'runJqlQueryPost',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['lexiconSchema'] } },
				options: [
					{
						name: 'Create or Replace a Schema',
						value: 'createOrReplaceSchemaPost',
						action: 'Create or replace a schema',
						description: 'Creates or replaces the schema of one entity, by entity type and name',
					},
					{
						name: 'Create or Replace Schemas',
						value: 'createOrReplaceSchemasPost',
						action: 'Create or replace schemas',
						description: 'Creates or replaces several schemas in one call',
					},
					{
						name: 'Delete a Schema',
						value: 'deleteSchemaDelete',
						action: 'Delete a schema',
						description: 'Deletes the schema of one entity, by entity type and name',
					},
					{
						name: 'Delete All Schemas',
						value: 'deleteAllSchemasDelete',
						action: 'Delete all schemas',
						description: 'Deletes every schema of the project',
					},
					{
						name: 'Delete Schemas for an Entity Type',
						value: 'deleteSchemasForEntityDelete',
						action: 'Delete schemas for an entity type',
						description: 'Deletes the schemas of one entity type (event or profile)',
					},
					{
						name: 'Get a Schema',
						value: 'getSchemaGet',
						action: 'Get a schema',
						description: 'Returns the schema of one entity, by entity type and name',
					},
					{
						name: 'List Schemas',
						value: 'listSchemasGet',
						action: 'List schemas',
						description: 'Lists all schemas of the project',
					},
					{
						name: 'List Schemas for an Entity Type',
						value: 'listSchemasForEntityGet',
						action: 'List schemas for an entity type',
						description: 'Lists the schemas of one entity type (event or profile)',
					},
				],
				default: 'createOrReplaceSchemaPost',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['lookupTable'] } },
				options: [
					{
						name: 'List Lookup Tables',
						value: 'listLookupTablesGet',
						action: 'List lookup tables',
						description: 'Returns the lookup tables of the project',
					},
					{
						name: 'Replace a Lookup Table',
						value: 'replaceLookupTablePut',
						action: 'Replace a lookup table',
						description: 'Replaces the content of a lookup table with a CSV',
					},
				],
				default: 'listLookupTablesGet',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['retention'] } },
				options: [
					{
						name: 'Get Frequency Report',
						value: 'getFrequencyReportGet',
						action: 'Get frequency report',
						description: 'Returns how often users performed an event per hour or day',
					},
					{
						name: 'Get Retention Report',
						value: 'getRetentionReportGet',
						action: 'Get retention report',
						description: 'Returns cohort retention (birth or compounded) between two dates',
					},
				],
				default: 'getFrequencyReportGet',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['segmentation'] } },
				options: [
					{
						name: 'Get Numeric Average',
						value: 'getNumericAverageGet',
						action: 'Get numeric average',
						description: 'Returns the average of a numeric expression for an event, per unit of time',
					},
					{
						name: 'Get Numeric Buckets',
						value: 'getNumericBucketsGet',
						action: 'Get numeric buckets',
						description: 'Returns data for an event segmented by a numeric property, placed into numeric buckets',
					},
					{
						name: 'Get Numeric Sum',
						value: 'getNumericSumGet',
						action: 'Get numeric sum',
						description: 'Returns the sum of a numeric expression for an event, per unit of time',
					},
					{
						name: 'Get Segmentation Report',
						value: 'getSegmentationReportGet',
						action: 'Get segmentation report',
						description: 'Returns data for an event, segmented and filtered by properties',
					},
				],
				default: 'getNumericAverageGet',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['serviceAccount'] } },
				options: [
					{
						name: 'Add Service Accounts to Projects',
						value: 'addServiceAccountsToProjectsPost',
						action: 'Add service accounts to projects',
						description: 'Adds service accounts to projects with the given role',
					},
					{
						name: 'Create a Service Account',
						value: 'createServiceAccountPost',
						action: 'Create a service account',
						description: 'Creates a service account in the organization, optionally adding it to projects. The secret is only returned in this response.',
					},
					{
						name: 'Delete a Service Account',
						value: 'deleteServiceAccountDelete',
						action: 'Delete a service account',
						description: 'Removes the service account from all its projects and deletes it from the organization',
					},
					{
						name: 'Get a Service Account',
						value: 'getServiceAccountGet',
						action: 'Get a service account',
						description: 'Returns a single service account by ID',
					},
					{
						name: 'List Project Service Accounts',
						value: 'listProjectServiceAccountsGet',
						action: 'List project service accounts',
						description: 'Returns the service accounts that are members of the project',
					},
					{
						name: 'List Service Accounts',
						value: 'listServiceAccountsGet',
						action: 'List service accounts',
						description: 'Returns all service accounts of the organization',
					},
					{
						name: 'Remove Service Accounts From Projects',
						value: 'removeServiceAccountsFromProjectsPost',
						action: 'Remove service accounts from projects',
						description: 'Removes service accounts from projects',
					},
				],
				default: 'addServiceAccountsToProjectsPost',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['userProfile'] } },
				options: [
					{
						name: 'Append to List Property',
						value: 'appendToListPost',
						action: 'Append to list property',
						description: 'Appends values to a list property of a user profile ($append)',
					},
					{
						name: 'Batch Update Profiles',
						value: 'batchUpdateProfilesPost',
						action: 'Batch update profiles',
						description: 'Sends several user profile updates in one call, each with its own operation',
					},
					{
						name: 'Delete a Profile',
						value: 'deleteProfilePost',
						action: 'Delete a profile',
						description: 'Deletes a user profile and all its properties ($delete)',
					},
					{
						name: 'Get Profile Activity',
						value: 'getProfileActivityGet',
						action: 'Get profile activity',
						description: 'Returns the activity feed of the given users. In maintenance mode on Mixpanel\'s side.',
					},
					{
						name: 'Increment Numerical Properties',
						value: 'incrementPropertiesPost',
						action: 'Increment numerical properties',
						description: 'Adds the given amounts to numeric properties of a user profile ($add)',
					},
					{
						name: 'Query Profiles',
						value: 'queryProfilesPost',
						action: 'Query profiles',
						description: 'Returns user or group profiles matching a filter, a cohort or a list of distinct IDs, page by page',
					},
					{
						name: 'Remove From List Property',
						value: 'removeFromListPost',
						action: 'Remove from list property',
						description: 'Removes a value from a list property of a user profile ($remove)',
					},
					{
						name: 'Set Properties',
						value: 'setPropertiesPost',
						action: 'Set properties',
						description: 'Sets properties on a user profile ($set), creating the profile if needed and overwriting existing values',
					},
					{
						name: 'Set Properties Once',
						value: 'setPropertiesOncePost',
						action: 'Set properties once',
						description: 'Sets properties on a user profile only when they are not set yet ($set_once)',
					},
					{
						name: 'Union to List Property',
						value: 'unionToListPost',
						action: 'Union to list property',
						description: 'Adds values to a list property of a user profile, without duplicates ($union)',
					},
					{
						name: 'Unset Properties',
						value: 'unsetPropertiesPost',
						action: 'Unset properties',
						description: 'Removes properties and their values from a user profile ($unset)',
					},
				],
				default: 'appendToListPost',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['warehouseImport'] } },
				options: [
					{
						name: 'Create a Groups Import',
						value: 'createGroupsImportPost',
						action: 'Create a groups import',
						description: 'Creates an import that syncs group profile properties from a warehouse table',
					},
					{
						name: 'Create a Lookup Table Import',
						value: 'createLookupTableImportPost',
						action: 'Create a lookup table import',
						description: 'Creates an import that fills a lookup table from a warehouse table',
					},
					{
						name: 'Create a People Import',
						value: 'createPeopleImportPost',
						action: 'Create a people import',
						description: 'Creates an import that syncs user profile properties from a warehouse table',
					},
					{
						name: 'Create an Event Stream Import',
						value: 'createEventStreamImportPost',
						action: 'Create an event stream import',
						description: 'Creates an import that turns each row of a warehouse table into an event',
					},
					{
						name: 'Delete a Warehouse Import',
						value: 'deleteWarehouseImportDelete',
						action: 'Delete a warehouse import',
						description: 'Deletes a warehouse import, and its imported events when delete_data is true',
					},
					{
						name: 'Get a Warehouse Import',
						value: 'getWarehouseImportGet',
						action: 'Get a warehouse import',
						description: 'Returns the full configuration of a warehouse import',
					},
					{
						name: 'Get Warehouse Import History',
						value: 'getWarehouseImportHistoryGet',
						action: 'Get warehouse import history',
						description: 'Returns the 30 most recent runs of a warehouse import',
					},
					{
						name: 'List Warehouse Imports',
						value: 'listWarehouseImportsGet',
						action: 'List warehouse imports',
						description: 'Returns all warehouse imports of the project with their configuration and sync status',
					},
					{
						name: 'Run a Warehouse Import',
						value: 'runWarehouseImportPut',
						action: 'Run a warehouse import',
						description: 'Triggers an immediate sync of a warehouse import',
					},
					{
						name: 'Update a Warehouse Import',
						value: 'updateWarehouseImportPatch',
						action: 'Update a warehouse import',
						description: 'Updates the settings of a warehouse import, such as paused or run_every',
					},
				],
				default: 'createGroupsImportPost',
			},
			{
				displayName: 'Annotation ID',
				name: 'annotationId',
				type: 'string',
				default: '',
				required: true,
				description: 'Numeric identifier of the annotation',
				displayOptions: {
					show: {
						operation: [
							'deleteAnnotationDelete',
							'getAnnotationGet',
							'updateAnnotationPatch',
						],
					},
				},
			},
			{
				displayName: 'Entity Type',
				name: 'entityType',
				type: 'options',
				options: [
					{ name: 'Event', value: 'event' },
					{ name: 'Profile', value: 'profile' },
				],
				default: 'event',
				required: true,
				description: 'Type of entity the schema describes',
				displayOptions: {
					show: {
						operation: [
							'createOrReplaceSchemaPost',
							'deleteSchemaDelete',
							'deleteSchemasForEntityDelete',
							'getSchemaGet',
							'listSchemasForEntityGet',
						],
					},
				},
			},
			{
				displayName: 'Entity Name',
				name: 'entityName',
				type: 'string',
				default: '',
				required: true,
				description: 'Name of the event or profile property set the schema describes, such as Added To Cart',
				displayOptions: {
					show: {
						operation: [
							'createOrReplaceSchemaPost',
							'deleteSchemaDelete',
							'getSchemaGet',
						],
					},
				},
			},
			{
				displayName: 'Experiment ID',
				name: 'experimentId',
				type: 'string',
				default: '',
				required: true,
				description: 'Identifier of the experiment',
				displayOptions: {
					show: {
						operation: [
							'archiveExperimentPost',
							'decideExperimentPatch',
							'deleteExperimentDelete',
							'forceConcludeExperimentPut',
							'getExperimentGet',
							'launchExperimentPut',
							'unarchiveExperimentDelete',
							'updateExperimentPatch',
						],
					},
				},
			},
			{
				displayName: 'Feature Flag ID',
				name: 'flagId',
				type: 'string',
				default: '',
				required: true,
				description: 'Identifier of the feature flag',
				displayOptions: {
					show: {
						operation: [
							'deleteFeatureFlagDelete',
							'getFeatureFlagGet',
							'updateFeatureFlagPut',
						],
					},
				},
			},
			{
				displayName: 'Warehouse Import ID',
				name: 'importId',
				type: 'string',
				default: '',
				required: true,
				description: 'Numeric identifier of the warehouse import',
				displayOptions: {
					show: {
						operation: [
							'deleteWarehouseImportDelete',
							'getWarehouseImportGet',
							'getWarehouseImportHistoryGet',
							'runWarehouseImportPut',
							'updateWarehouseImportPatch',
						],
					},
				},
			},
			{
				displayName: 'Lookup Table ID',
				name: 'lookupTableId',
				type: 'string',
				default: '',
				required: true,
				description: 'Identifier of the lookup table. Use List Lookup Tables, or Lexicon in the Mixpanel interface, to find it.',
				displayOptions: {
					show: {
						operation: [
							'replaceLookupTablePut',
						],
					},
				},
			},
			{
				displayName: 'Organization ID',
				name: 'organizationId',
				type: 'string',
				default: '',
				required: true,
				description: 'Numeric identifier of the Mixpanel organization, shown in Organization Settings',
				displayOptions: {
					show: {
						operation: [
							'addServiceAccountsToProjectsPost',
							'createServiceAccountPost',
							'deleteServiceAccountDelete',
							'getServiceAccountGet',
							'listServiceAccountsGet',
							'queryAuditLogsPost',
							'removeServiceAccountsFromProjectsPost',
						],
					},
				},
			},
			{
				displayName: 'Service Account ID',
				name: 'serviceAccountId',
				type: 'string',
				default: '',
				required: true,
				description: 'Numeric identifier of the service account',
				displayOptions: {
					show: {
						operation: [
							'deleteServiceAccountDelete',
							'getServiceAccountGet',
						],
					},
				},
			},
			{
				displayName: 'Tracking ID',
				name: 'trackingId',
				type: 'string',
				default: '',
				required: true,
				description: 'Task ID returned when the retrieval or deletion was created',
				displayOptions: {
					show: {
						operation: [
							'cancelDeletionDelete',
							'getDeletionGet',
							'getRetrievalGet',
						],
					},
				},
			},
			{
				displayName: 'Workspace ID',
				name: 'workspaceId',
				type: 'string',
				default: '',
				required: true,
				description: 'Numeric identifier of the workspace (data view). Shown in the URL of the project: /project/PROJECT_ID/view/WORKSPACE_ID/.',
				displayOptions: {
					show: {
						operation: [
							'archiveExperimentPost',
							'createExperimentPost',
							'createFeatureFlagPost',
							'decideExperimentPatch',
							'deleteExperimentDelete',
							'deleteFeatureFlagDelete',
							'forceConcludeExperimentPut',
							'getExperimentGet',
							'getFeatureFlagGet',
							'launchExperimentPut',
							'listExperimentsGet',
							'listFeatureFlagsGet',
							'unarchiveExperimentDelete',
							'updateExperimentPatch',
							'updateFeatureFlagPut',
						],
					},
				},
			},
			{
				displayName: 'CSV Content',
				name: 'csvContent',
				type: 'string',
				typeOptions: { rows: 6 },
				default: '',
				required: true,
				description: 'Full content of the lookup table as CSV, header row first. The first column is the join key. It replaces the whole table.',
				placeholder: 'id,name\n1,Alpha\n2,Beta',
				displayOptions: {
					show: {
						operation: [
							'replaceLookupTablePut',
						],
					},
				},
			},
			{
				displayName: 'Query Parameters',
				name: 'queryParameters',
				type: 'collection',
				placeholder: 'Add Query Parameter',
				default: {},
				description: 'Query string parameters of the selected operation. Only the ones the operation accepts are read by the API. project_id and token are added from the credential.',
				options: [
					{
						displayName: 'Addiction Unit',
						name: 'addiction_unit',
						type: 'options',
						options: [
							{ name: 'Day', value: 'day' },
							{ name: 'Hour', value: 'hour' },
						],
						default: 'day',
						description: 'Granularity at which the frequency of actions is returned',
					},
					{
						displayName: 'Bookmark ID',
						name: 'bookmark_id',
						type: 'number',
						default: 0,
						description: 'ID of the Insights report: the number that follows report- in the URL of the report',
					},
					{
						displayName: 'Born Event',
						name: 'born_event',
						type: 'string',
						default: '',
						description: 'First event a user must do to enter a birth retention cohort. Required when Retention Type is Birth.',
					},
					{
						displayName: 'Born Where',
						name: 'born_where',
						type: 'string',
						default: '',
						description: 'Segmentation expression that filters the born events',
					},
					{
						displayName: 'Context',
						name: 'context',
						type: 'string',
						default: '',
						description: 'JSON evaluation context: distinct_id (required), and optionally device_id and a custom_properties object. Example: {"distinct_id": "user-1"}.',
					},
					{
						displayName: 'Cursor',
						name: 'cursor',
						type: 'string',
						default: '',
						description: 'Pagination cursor returned by the previous page',
					},
					{
						displayName: 'Distinct IDs',
						name: 'distinct_ids',
						type: 'string',
						default: '',
						description: 'JSON array of the distinct IDs to return the activity feed of, such as ["user-1", "user-2"]',
					},
					{
						displayName: 'Entity Name (Filter)',
						name: 'entity_name',
						type: 'string',
						default: '',
						description: 'Restricts the schemas to one entity name, such as Added To Cart',
					},
					{
						displayName: 'Event',
						name: 'event',
						type: 'string',
						default: '',
						description: 'Event name. Get Event Counts and Export Events take a JSON array instead, such as ["signup", "purchase"].',
					},
					{
						displayName: 'Format',
						name: 'format',
						type: 'options',
						options: [
							{ name: 'CSV', value: 'csv' },
							{ name: 'JSON', value: 'json' },
						],
						default: 'json',
						description: 'Response format',
					},
					{
						displayName: 'From Date',
						name: 'from_date',
						type: 'string',
						default: '',
						description: 'Start of the period, inclusive, as YYYY-MM-DD',
					},
					{
						displayName: 'Funnel ID',
						name: 'funnel_id',
						type: 'number',
						default: 0,
						description: 'ID of the funnel, as returned by List Funnels',
					},
					{
						displayName: 'Include Archived',
						name: 'include_archived',
						type: 'boolean',
						default: false,
						description: 'Whether to include archived feature flags',
					},
					{
						displayName: 'Interval',
						name: 'interval',
						type: 'number',
						default: 1,
						description: 'Number of units per bucket, or number of units to return data for, depending on the operation',
					},
					{
						displayName: 'Interval Count',
						name: 'interval_count',
						type: 'number',
						default: 1,
						description: 'Number of retention buckets to return',
					},
					{
						displayName: 'Length',
						name: 'length',
						type: 'number',
						default: 0,
						description: 'Time a user has to complete the funnel, in Length Unit, from the first step',
					},
					{
						displayName: 'Length Unit',
						name: 'length_unit',
						type: 'options',
						options: [
							{ name: 'Day', value: 'day' },
							{ name: 'Hour', value: 'hour' },
							{ name: 'Minute', value: 'minute' },
							{ name: 'Second', value: 'second' },
						],
						default: 'day',
						description: 'Unit of Length',
					},
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 50,
						description: 'Max number of results to return',
					},
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
						description: 'Name of the pipeline (pipeline operations) or of the property (event breakdown operations)',
					},
					{
						displayName: 'On',
						name: 'on',
						type: 'string',
						default: '',
						description: 'Property expression to segment on, such as properties["$browser"]',
					},
					{
						displayName: 'Order',
						name: 'order',
						type: 'options',
						options: [
							{ name: 'Newest First', value: 'desc' },
							{ name: 'Oldest First', value: 'asc' },
						],
						default: 'desc',
						description: 'Sort order of the results',
					},
					{
						displayName: 'Page Size',
						name: 'page_size',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 100,
						description: 'Number of items per page',
					},
					{
						displayName: 'Retention Type',
						name: 'retention_type',
						type: 'options',
						options: [
							{ name: 'Birth', value: 'birth' },
							{ name: 'Compounded', value: 'compounded' },
						],
						default: 'birth',
						description: 'Birth is first-time retention, compounded is recurring retention',
					},
					{
						displayName: 'Status',
						name: 'status',
						type: 'string',
						default: '',
						description: 'Comma-separated task statuses to filter on: pending, running, retried, failed, canceled, timed_out',
					},
					{
						displayName: 'Strict',
						name: 'strict',
						type: 'boolean',
						default: true,
						description: 'Whether Mixpanel validates the batch and returns an error per invalid record. The node enables it by default on Import Events and Merge Identities.',
					},
					{
						displayName: 'Summary',
						name: 'summary',
						type: 'boolean',
						default: false,
						description: 'Whether to only return the task count per status, without details',
					},
					{
						displayName: 'Time in Milliseconds',
						name: 'time_in_ms',
						type: 'boolean',
						default: false,
						description: 'Whether to export event timestamps with millisecond precision',
					},
					{
						displayName: 'To Date',
						name: 'to_date',
						type: 'string',
						default: '',
						description: 'End of the period, inclusive, as YYYY-MM-DD',
					},
					{
						displayName: 'Type',
						name: 'type',
						type: 'options',
						options: [
							{ name: 'Average', value: 'average' },
							{ name: 'General', value: 'general' },
							{ name: 'Unique', value: 'unique' },
						],
						default: 'general',
						description: 'Analysis type: total counts, unique users, or average per user',
					},
					{
						displayName: 'Unbounded Retention',
						name: 'unbounded_retention',
						type: 'boolean',
						default: false,
						description: 'Whether retention values accumulate from right to left (day N counts users retained on day N or later)',
					},
					{
						displayName: 'Unit',
						name: 'unit',
						type: 'options',
						options: [
							{ name: 'Day', value: 'day' },
							{ name: 'Hour', value: 'hour' },
							{ name: 'Minute', value: 'minute' },
							{ name: 'Month', value: 'month' },
							{ name: 'Week', value: 'week' },
						],
						default: 'day',
						description: 'Time unit of the buckets. Each operation accepts a subset of these values.',
					},
					{
						displayName: 'Use Request IP',
						name: 'ip',
						type: 'boolean',
						default: false,
						description: 'Whether Mixpanel should geolocate the data from the IP address of the request. Leave off for server-side calls, which would all be located at the n8n server.',
					},
					{
						displayName: 'Values',
						name: 'values',
						type: 'string',
						default: '',
						description: 'JSON array of the property values to return data for, such as ["male", "female"]',
					},
					{
						displayName: 'Verbose',
						name: 'verbose',
						type: 'boolean',
						default: true,
						description: 'Whether Mixpanel answers with a JSON status and error message. The node enables it by default on ingestion operations, so that a rejected call fails the node.',
					},
					{
						displayName: 'Where',
						name: 'where',
						type: 'string',
						default: '',
						description: 'Segmentation expression to filter on, such as properties["country"] == "France"',
					},
					{
						displayName: 'Workspace ID (Query)',
						name: 'workspace_id',
						type: 'number',
						default: 0,
						description: 'Workspace (data view) to query, if the project uses several',
					},
				],
			},
			{
				displayName: 'Request Body',
				name: 'requestBody',
				type: 'json',
				default: '{}',
				description: 'Raw JSON request body. See the Mixpanel API reference of the selected operation for its schema. Form-encoded operations take a JSON object whose fields become the form fields.',
				displayOptions: {
					show: {
						operation: [
							'addServiceAccountsToProjectsPost',
							'appendToListPost',
							'archiveExperimentPost',
							'batchUpdateGroupProfilesPost',
							'batchUpdateProfilesPost',
							'createAliasPost',
							'createAnnotationPost',
							'createAnnotationTagPost',
							'createDeletionPost',
							'createEventStreamImportPost',
							'createExperimentPost',
							'createFeatureFlagPost',
							'createGroupsImportPost',
							'createIdentityPost',
							'createLookupTableImportPost',
							'createOrReplaceSchemaPost',
							'createOrReplaceSchemasPost',
							'createPeopleImportPost',
							'createPipelinePost',
							'createRetrievalPost',
							'createServiceAccountPost',
							'decideExperimentPatch',
							'deleteGroupProfilePost',
							'deletePipelinePost',
							'deleteProfilePost',
							'deleteWarehouseImportDelete',
							'editPipelinePost',
							'forceConcludeExperimentPut',
							'importEventsPost',
							'incrementPropertiesPost',
							'launchExperimentPut',
							'mergeIdentitiesPost',
							'pausePipelinePost',
							'queryAuditLogsPost',
							'queryProfilesPost',
							'removeFromGroupListPost',
							'removeFromListPost',
							'removeServiceAccountsFromProjectsPost',
							'resumePipelinePost',
							'runJqlQueryPost',
							'runWarehouseImportPut',
							'setGroupPropertiesOncePost',
							'setGroupPropertiesPost',
							'setPropertiesOncePost',
							'setPropertiesPost',
							'trackEventsPost',
							'unionToGroupListPost',
							'unionToListPost',
							'unsetGroupPropertiesPost',
							'unsetPropertiesPost',
							'updateAnnotationPatch',
							'updateExperimentPatch',
							'updateFeatureFlagPut',
							'updateWarehouseImportPatch',
						],
					},
				},
			},
		],
	};

	methods = {
		credentialTest: {
			// The GDPR API has no endpoint that answers 200 without a job to look at. Asking
			// for the status of a job that does not exist tells a valid token (404) from an
			// invalid one (401 or 403).
			async mixpanelGdprApiTest(
				this: ICredentialTestFunctions,
				credential: ICredentialsDecrypted,
			): Promise<INodeCredentialTestResult> {
				const data = credential.data ?? {};
				const region = (data.region as string) || 'us';
				const host = HOSTS.app[region] ?? HOSTS.app.us;
				try {
					// ICredentialTestFunctions only exposes request(), not httpRequest().
					// eslint-disable-next-line @n8n/community-nodes/no-deprecated-workflow-functions
					await this.helpers.request({
						method: 'GET',
						uri: `${host}/data-retrievals/v3.0/credential-test`,
						qs: { token: data.projectToken },
						headers: { Authorization: `Bearer ${data.oauthToken}` },
						json: true,
					});
				} catch (error) {
					const status = (error as IDataObject).statusCode as number | undefined;
					if (status === 401 || status === 403) {
						return { status: 'Error', message: 'Mixpanel rejected the OAuth token or the project token' };
					}
					if (status !== 404 && status !== 400) {
						return { status: 'Error', message: (error as Error).message };
					}
				}
				return { status: 'OK', message: 'Connection successful' };
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			// Errors from executeItem are already NodeApiError/NodeOperationError, so the
			// default path lets them propagate untouched rather than re-wrapping them.
			if (!this.continueOnFail()) {
				returnData.push(...(await executeItem.call(this, i)));
				continue;
			}

			try {
				returnData.push(...(await executeItem.call(this, i)));
			} catch (error) {
				returnData.push({
					json: { error: (error as Error).message },
					pairedItem: { item: i },
				});
			}
		}

		return [returnData];
	}
}

function requireParam(node: INode, itemIndex: number, label: string, value: string): void {
	if (value.trim() === '') {
		throw new NodeOperationError(node, `${label} is required`, { itemIndex });
	}
}

export async function executeItem(
	this: IExecuteFunctions,
	i: number,
): Promise<INodeExecutionData[]> {
	const node = this.getNode();
	const resource = this.getNodeParameter('resource', i, '') as string;
	const operation = this.getNodeParameter('operation', i, '') as string;
	const authentication = this.getNodeParameter('authentication', 0, 'serviceAccount') as string;
	const credentialType =
		resource === 'gdpr'
			? 'mixpanelGdprApi'
			: authentication === 'projectSecret'
				? 'mixpanelProjectSecretApi'
				: 'mixpanelServiceAccountApi';
	const isServiceAccount = credentialType === 'mixpanelServiceAccountApi';

	const credentials = await this.getCredentials(credentialType);
	const region = (credentials.region as string) || 'us';
	const projectToken = ((credentials.projectToken as string) ?? '').trim();
	const projectIdRaw = String(credentials.projectId ?? '').trim();

	// Path segments are user input (an entity name can hold spaces or slashes), so each
	// one is encoded once here and used as is in the paths below.
	const pathParam = (name: string): string =>
		encodeURIComponent(((this.getNodeParameter(name, i, '') as string) ?? '').toString().trim());
	const projectId = encodeURIComponent(projectIdRaw);
	const annotationId = pathParam('annotationId');
	const entityName = pathParam('entityName');
	const entityType = pathParam('entityType');
	const experimentId = pathParam('experimentId');
	const flagId = pathParam('flagId');
	const importId = pathParam('importId');
	const lookupTableId = pathParam('lookupTableId');
	const organizationId = pathParam('organizationId');
	const serviceAccountId = pathParam('serviceAccountId');
	const trackingId = pathParam('trackingId');
	const workspaceId = pathParam('workspaceId');

	const queryParameters = this.getNodeParameter('queryParameters', i, {}) as Record<
		string,
		string | number | boolean
	>;

	const queryParams = new URLSearchParams();
	Object.entries(queryParameters).forEach(([key, value]) => {
		if (value === '' || value === null || value === undefined) return;
		if (typeof value === 'boolean' && NUMERIC_FLAGS.has(key)) {
			queryParams.append(key, value ? '1' : '0');
		} else if (key === 'status') {
			// The pipeline status filter is an array: one status=... per value.
			String(value)
				.split(',')
				.map((s) => s.trim())
				.filter((s) => s !== '')
				.forEach((s) => queryParams.append(key, s));
		} else {
			queryParams.append(key, String(value));
		}
	});

	// The Annotations API is the only one to spell its dates in camelCase.
	if (operation === 'listAnnotationsGet') {
		for (const [from, to] of [
			['from_date', 'fromDate'],
			['to_date', 'toDate'],
		]) {
			const value = queryParams.get(from);
			if (value !== null) {
				queryParams.delete(from);
				queryParams.set(to, value);
			}
		}
	}

	if (STRICT_BY_DEFAULT.has(operation) && !queryParams.has('strict')) {
		queryParams.set('strict', '1');
	}
	// Without verbose=1 the ingestion endpoints answer 1 or 0 and nothing else, so a
	// rejected call would look like a success.
	if (TOKEN_AUTH.has(operation) && !queryParams.has('verbose')) {
		queryParams.set('verbose', '1');
	}

	// With a project secret, Mixpanel infers the project from the secret and rejects an
	// explicit project_id on some endpoints: it is only sent for service accounts.
	if (isServiceAccount && PROJECT_ID_QUERY.has(operation)) {
		requireParam(node, i, 'Project ID (credential)', projectIdRaw);
		queryParams.set('project_id', projectIdRaw);
	}
	if (TOKEN_QUERY.has(operation) && projectToken !== '') {
		queryParams.set('token', projectToken);
	}
	if (TOKEN_REQUIRED.has(operation) && projectToken === '') {
		throw new NodeOperationError(
			node,
			'This operation needs the project token. Set Project Token in the credential',
			{ itemIndex: i },
		);
	}

	const missing = (REQUIRED_QUERY[operation] ?? []).filter((key) => !queryParams.has(key));
	if (missing.length > 0) {
		throw new NodeOperationError(
			node,
			`This operation needs the following query parameters: ${missing.join(', ')}. Add them under Query Parameters`,
			{ itemIndex: i },
		);
	}

	const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';

	let api = 'app';
	let endpointPath = '';

	switch (resource) {
		case 'annotation':
			switch (operation) {
				case 'createAnnotationPost':
				case 'listAnnotationsGet':
					api = 'app';
					endpointPath = `/projects/${projectId}/annotations${queryString}`;
					break;
				case 'deleteAnnotationDelete':
				case 'getAnnotationGet':
				case 'updateAnnotationPatch':
					requireParam(node, i, 'Annotation ID', annotationId);
					api = 'app';
					endpointPath = `/projects/${projectId}/annotations/${annotationId}${queryString}`;
					break;
				case 'createAnnotationTagPost':
				case 'listAnnotationTagsGet':
					api = 'app';
					endpointPath = `/projects/${projectId}/annotations/tags${queryString}`;
					break;
				default:
					throw new NodeOperationError(node, `Unknown operation: ${operation}`);
			}
			break;
		case 'auditLog':
			switch (operation) {
				case 'queryAuditLogsPost':
					requireParam(node, i, 'Organization ID', organizationId);
					api = 'platform';
					endpointPath = `/v1/organizations/${organizationId}/audit-logs/query${queryString}`;
					break;
				default:
					throw new NodeOperationError(node, `Unknown operation: ${operation}`);
			}
			break;
		case 'cohort':
			switch (operation) {
				case 'listCohortsPost':
					api = 'query';
					endpointPath = `/cohorts/list${queryString}`;
					break;
				default:
					throw new NodeOperationError(node, `Unknown operation: ${operation}`);
			}
			break;
		case 'dataPipeline':
			switch (operation) {
				case 'deletePipelinePost':
					api = 'data';
					endpointPath = `/nessie/pipeline/cancel${queryString}`;
					break;
				case 'createPipelinePost':
					api = 'data';
					endpointPath = `/nessie/pipeline/create${queryString}`;
					break;
				case 'editPipelinePost':
					api = 'data';
					endpointPath = `/nessie/pipeline/edit${queryString}`;
					break;
				case 'listPipelinesGet':
					api = 'data';
					endpointPath = `/nessie/pipeline/jobs${queryString}`;
					break;
				case 'pausePipelinePost':
					api = 'data';
					endpointPath = `/nessie/pipeline/pause${queryString}`;
					break;
				case 'resumePipelinePost':
					api = 'data';
					endpointPath = `/nessie/pipeline/resume${queryString}`;
					break;
				case 'getPipelineGet':
					api = 'data';
					endpointPath = `/nessie/pipeline/status${queryString}`;
					break;
				case 'listPipelineLogsGet':
					api = 'data';
					endpointPath = `/nessie/pipeline/timeline${queryString}`;
					break;
				default:
					throw new NodeOperationError(node, `Unknown operation: ${operation}`);
			}
			break;
		case 'event':
			switch (operation) {
				case 'exportEventsGet':
					api = 'data';
					endpointPath = `/export${queryString}`;
					break;
				case 'importEventsPost':
					api = 'ingestion';
					endpointPath = `/import${queryString}`;
					break;
				case 'trackEventsPost':
					api = 'ingestion';
					endpointPath = `/track${queryString}`;
					break;
				default:
					throw new NodeOperationError(node, `Unknown operation: ${operation}`);
			}
			break;
		case 'eventBreakdown':
			switch (operation) {
				case 'getEventCountsGet':
					api = 'query';
					endpointPath = `/events${queryString}`;
					break;
				case 'getTopEventNamesGet':
					api = 'query';
					endpointPath = `/events/names${queryString}`;
					break;
				case 'getEventPropertyValuesGet':
					api = 'query';
					endpointPath = `/events/properties${queryString}`;
					break;
				case 'getTopEventPropertiesGet':
					api = 'query';
					endpointPath = `/events/properties/top${queryString}`;
					break;
				case 'getTopPropertyValuesGet':
					api = 'query';
					endpointPath = `/events/properties/values${queryString}`;
					break;
				case 'getTodayTopEventsGet':
					api = 'query';
					endpointPath = `/events/top${queryString}`;
					break;
				default:
					throw new NodeOperationError(node, `Unknown operation: ${operation}`);
			}
			break;
		case 'experiment':
			switch (operation) {
				case 'createExperimentPost':
				case 'listExperimentsGet':
					requireParam(node, i, 'Workspace ID', workspaceId);
					api = 'app';
					endpointPath = `/workspaces/${workspaceId}/experiments${queryString}`;
					break;
				case 'deleteExperimentDelete':
				case 'getExperimentGet':
				case 'updateExperimentPatch':
					requireParam(node, i, 'Workspace ID', workspaceId);
					requireParam(node, i, 'Experiment ID', experimentId);
					api = 'app';
					endpointPath = `/workspaces/${workspaceId}/experiments/${experimentId}${queryString}`;
					break;
				case 'archiveExperimentPost':
				case 'unarchiveExperimentDelete':
					requireParam(node, i, 'Workspace ID', workspaceId);
					requireParam(node, i, 'Experiment ID', experimentId);
					api = 'app';
					endpointPath = `/workspaces/${workspaceId}/experiments/${experimentId}/archive${queryString}`;
					break;
				case 'decideExperimentPatch':
					requireParam(node, i, 'Workspace ID', workspaceId);
					requireParam(node, i, 'Experiment ID', experimentId);
					api = 'app';
					endpointPath = `/workspaces/${workspaceId}/experiments/${experimentId}/decide${queryString}`;
					break;
				case 'forceConcludeExperimentPut':
					requireParam(node, i, 'Workspace ID', workspaceId);
					requireParam(node, i, 'Experiment ID', experimentId);
					api = 'app';
					endpointPath = `/workspaces/${workspaceId}/experiments/${experimentId}/force_conclude${queryString}`;
					break;
				case 'launchExperimentPut':
					requireParam(node, i, 'Workspace ID', workspaceId);
					requireParam(node, i, 'Experiment ID', experimentId);
					api = 'app';
					endpointPath = `/workspaces/${workspaceId}/experiments/${experimentId}/launch${queryString}`;
					break;
				default:
					throw new NodeOperationError(node, `Unknown operation: ${operation}`);
			}
			break;
		case 'featureFlag':
			switch (operation) {
				case 'createFeatureFlagPost':
				case 'listFeatureFlagsGet':
					requireParam(node, i, 'Workspace ID', workspaceId);
					api = 'app';
					endpointPath = `/projects/${projectId}/workspaces/${workspaceId}/feature-flags${queryString}`;
					break;
				case 'deleteFeatureFlagDelete':
				case 'getFeatureFlagGet':
				case 'updateFeatureFlagPut':
					requireParam(node, i, 'Workspace ID', workspaceId);
					requireParam(node, i, 'Feature Flag ID', flagId);
					api = 'app';
					endpointPath = `/projects/${projectId}/workspaces/${workspaceId}/feature-flags/${flagId}${queryString}`;
					break;
				case 'evaluateFeatureFlagsGet':
					api = 'ingestion';
					endpointPath = `/flags${queryString}`;
					break;
				case 'getFeatureFlagDefinitionsGet':
					api = 'ingestion';
					endpointPath = `/flags/definitions${queryString}`;
					break;
				default:
					throw new NodeOperationError(node, `Unknown operation: ${operation}`);
			}
			break;
		case 'funnel':
			switch (operation) {
				case 'getFunnelReportGet':
					api = 'query';
					endpointPath = `/funnels${queryString}`;
					break;
				case 'listFunnelsGet':
					api = 'query';
					endpointPath = `/funnels/list${queryString}`;
					break;
				default:
					throw new NodeOperationError(node, `Unknown operation: ${operation}`);
			}
			break;
		case 'gdpr':
			switch (operation) {
				case 'createDeletionPost':
					api = 'app';
					endpointPath = `/data-deletions/v3.0${queryString}`;
					break;
				case 'cancelDeletionDelete':
				case 'getDeletionGet':
					requireParam(node, i, 'Tracking ID', trackingId);
					api = 'app';
					endpointPath = `/data-deletions/v3.0/${trackingId}${queryString}`;
					break;
				case 'createRetrievalPost':
					api = 'app';
					endpointPath = `/data-retrievals/v3.0${queryString}`;
					break;
				case 'getRetrievalGet':
					requireParam(node, i, 'Tracking ID', trackingId);
					api = 'app';
					endpointPath = `/data-retrievals/v3.0/${trackingId}${queryString}`;
					break;
				default:
					throw new NodeOperationError(node, `Unknown operation: ${operation}`);
			}
			break;
		case 'groupProfile':
			switch (operation) {
				case 'batchUpdateGroupProfilesPost':
				case 'deleteGroupProfilePost':
				case 'removeFromGroupListPost':
				case 'setGroupPropertiesOncePost':
				case 'setGroupPropertiesPost':
				case 'unionToGroupListPost':
				case 'unsetGroupPropertiesPost':
					api = 'ingestion';
					endpointPath = `/groups${queryString}`;
					break;
				default:
					throw new NodeOperationError(node, `Unknown operation: ${operation}`);
			}
			break;
		case 'identity':
			switch (operation) {
				case 'mergeIdentitiesPost':
					api = 'ingestion';
					endpointPath = `/import${queryString}`;
					break;
				case 'createAliasPost':
				case 'createIdentityPost':
					api = 'ingestion';
					endpointPath = `/track${queryString}`;
					break;
				default:
					throw new NodeOperationError(node, `Unknown operation: ${operation}`);
			}
			break;
		case 'insight':
			switch (operation) {
				case 'getInsightsReportGet':
					api = 'query';
					endpointPath = `/insights${queryString}`;
					break;
				default:
					throw new NodeOperationError(node, `Unknown operation: ${operation}`);
			}
			break;
		case 'jql':
			switch (operation) {
				case 'runJqlQueryPost':
					api = 'query';
					endpointPath = `/jql${queryString}`;
					break;
				default:
					throw new NodeOperationError(node, `Unknown operation: ${operation}`);
			}
			break;
		case 'lexiconSchema':
			switch (operation) {
				case 'createOrReplaceSchemasPost':
				case 'deleteAllSchemasDelete':
				case 'listSchemasGet':
					api = 'app';
					endpointPath = `/projects/${projectId}/schemas${queryString}`;
					break;
				case 'deleteSchemasForEntityDelete':
				case 'listSchemasForEntityGet':
					api = 'app';
					endpointPath = `/projects/${projectId}/schemas/${entityType}${queryString}`;
					break;
				case 'createOrReplaceSchemaPost':
				case 'deleteSchemaDelete':
				case 'getSchemaGet':
					requireParam(node, i, 'Entity Name', entityName);
					api = 'app';
					endpointPath = `/projects/${projectId}/schemas/${entityType}/${entityName}${queryString}`;
					break;
				default:
					throw new NodeOperationError(node, `Unknown operation: ${operation}`);
			}
			break;
		case 'lookupTable':
			switch (operation) {
				case 'listLookupTablesGet':
					api = 'ingestion';
					endpointPath = `/lookup-tables${queryString}`;
					break;
				case 'replaceLookupTablePut':
					requireParam(node, i, 'Lookup Table ID', lookupTableId);
					api = 'ingestion';
					endpointPath = `/lookup-tables/${lookupTableId}${queryString}`;
					break;
				default:
					throw new NodeOperationError(node, `Unknown operation: ${operation}`);
			}
			break;
		case 'retention':
			switch (operation) {
				case 'getRetentionReportGet':
					api = 'query';
					endpointPath = `/retention${queryString}`;
					break;
				case 'getFrequencyReportGet':
					api = 'query';
					endpointPath = `/retention/addiction${queryString}`;
					break;
				default:
					throw new NodeOperationError(node, `Unknown operation: ${operation}`);
			}
			break;
		case 'segmentation':
			switch (operation) {
				case 'getSegmentationReportGet':
					api = 'query';
					endpointPath = `/segmentation${queryString}`;
					break;
				case 'getNumericAverageGet':
					api = 'query';
					endpointPath = `/segmentation/average${queryString}`;
					break;
				case 'getNumericBucketsGet':
					api = 'query';
					endpointPath = `/segmentation/numeric${queryString}`;
					break;
				case 'getNumericSumGet':
					api = 'query';
					endpointPath = `/segmentation/sum${queryString}`;
					break;
				default:
					throw new NodeOperationError(node, `Unknown operation: ${operation}`);
			}
			break;
		case 'serviceAccount':
			switch (operation) {
				case 'createServiceAccountPost':
				case 'listServiceAccountsGet':
					requireParam(node, i, 'Organization ID', organizationId);
					api = 'app';
					endpointPath = `/organizations/${organizationId}/service-accounts${queryString}`;
					break;
				case 'deleteServiceAccountDelete':
				case 'getServiceAccountGet':
					requireParam(node, i, 'Organization ID', organizationId);
					requireParam(node, i, 'Service Account ID', serviceAccountId);
					api = 'app';
					endpointPath = `/organizations/${organizationId}/service-accounts/${serviceAccountId}${queryString}`;
					break;
				case 'addServiceAccountsToProjectsPost':
					requireParam(node, i, 'Organization ID', organizationId);
					api = 'app';
					endpointPath = `/organizations/${organizationId}/service-accounts/add-to-project${queryString}`;
					break;
				case 'removeServiceAccountsFromProjectsPost':
					requireParam(node, i, 'Organization ID', organizationId);
					api = 'app';
					endpointPath = `/organizations/${organizationId}/service-accounts/remove-from-project${queryString}`;
					break;
				case 'listProjectServiceAccountsGet':
					api = 'app';
					endpointPath = `/projects/${projectId}/service-accounts${queryString}`;
					break;
				default:
					throw new NodeOperationError(node, `Unknown operation: ${operation}`);
			}
			break;
		case 'userProfile':
			switch (operation) {
				case 'appendToListPost':
				case 'batchUpdateProfilesPost':
				case 'deleteProfilePost':
				case 'incrementPropertiesPost':
				case 'removeFromListPost':
				case 'setPropertiesOncePost':
				case 'setPropertiesPost':
				case 'unionToListPost':
				case 'unsetPropertiesPost':
					api = 'ingestion';
					endpointPath = `/engage${queryString}`;
					break;
				case 'queryProfilesPost':
					api = 'query';
					endpointPath = `/engage${queryString}`;
					break;
				case 'getProfileActivityGet':
					api = 'query';
					endpointPath = `/stream/query${queryString}`;
					break;
				default:
					throw new NodeOperationError(node, `Unknown operation: ${operation}`);
			}
			break;
		case 'warehouseImport':
			switch (operation) {
				case 'listWarehouseImportsGet':
					api = 'app';
					endpointPath = `/projects/${projectId}/warehouse-sources/imports${queryString}`;
					break;
				case 'deleteWarehouseImportDelete':
				case 'getWarehouseImportGet':
				case 'updateWarehouseImportPatch':
					requireParam(node, i, 'Warehouse Import ID', importId);
					api = 'app';
					endpointPath = `/projects/${projectId}/warehouse-sources/imports/${importId}${queryString}`;
					break;
				case 'getWarehouseImportHistoryGet':
					requireParam(node, i, 'Warehouse Import ID', importId);
					api = 'app';
					endpointPath = `/projects/${projectId}/warehouse-sources/imports/${importId}/history${queryString}`;
					break;
				case 'runWarehouseImportPut':
					requireParam(node, i, 'Warehouse Import ID', importId);
					api = 'app';
					endpointPath = `/projects/${projectId}/warehouse-sources/imports/${importId}/manual-sync${queryString}`;
					break;
				case 'createEventStreamImportPost':
					api = 'app';
					endpointPath = `/projects/${projectId}/warehouse-sources/imports/event-stream${queryString}`;
					break;
				case 'createGroupsImportPost':
					api = 'app';
					endpointPath = `/projects/${projectId}/warehouse-sources/imports/groups${queryString}`;
					break;
				case 'createLookupTableImportPost':
					api = 'app';
					endpointPath = `/projects/${projectId}/warehouse-sources/imports/lookup-table${queryString}`;
					break;
				case 'createPeopleImportPost':
					api = 'app';
					endpointPath = `/projects/${projectId}/warehouse-sources/imports/people${queryString}`;
					break;
				default:
					throw new NodeOperationError(node, `Unknown operation: ${operation}`);
			}
			break;
		default:
			throw new NodeOperationError(node, `Unknown resource: ${resource}`);
	}

	if (endpointPath.includes('/projects//')) {
		requireParam(node, i, 'Project ID (credential)', projectIdRaw);
	}

	const method: IHttpRequestMethods = operation.endsWith('Delete')
		? 'DELETE'
		: operation.endsWith('Patch')
			? 'PATCH'
			: operation.endsWith('Put')
				? 'PUT'
				: operation.endsWith('Post')
					? 'POST'
					: 'GET';

	const url = `${(HOSTS[api] ?? HOSTS.app)[region] ?? HOSTS[api].us}${endpointPath}`;

	const headers: IDataObject = { Accept: 'application/json' };
	let body: string | undefined;

	if (operation === 'replaceLookupTablePut') {
		body = (this.getNodeParameter('csvContent', i, '') as string) ?? '';
		requireParam(node, i, 'CSV Content', body);
		headers['Content-Type'] = 'text/csv';
	} else if (['PATCH', 'POST', 'PUT'].includes(method)) {
		const parsed = parseBody.call(this, i);
		if (FORM_BODY.has(operation)) {
			const form = (parsed ?? {}) as IDataObject;
			if (Array.isArray(form)) {
				throw new NodeOperationError(node, 'Request Body must be a JSON object for this operation', {
					itemIndex: i,
				});
			}
			if (isServiceAccount && PROJECT_ID_FORM.has(operation) && form.project_id === undefined) {
				form.project_id = projectIdRaw;
			}
			body = toForm(form).toString();
			headers['Content-Type'] = 'application/x-www-form-urlencoded';
		} else if (FORM_DATA_BODY.has(operation)) {
			const event = injectToken(parsed, operation, projectToken);
			if (lacksToken(event, operation)) throw missingTokenError(node, i);
			body = new URLSearchParams({ data: JSON.stringify(event) }).toString();
			headers['Content-Type'] = 'application/x-www-form-urlencoded';
		} else if (parsed !== undefined) {
			const payload = TOKEN_AUTH.has(operation) ? injectToken(parsed, operation, projectToken) : parsed;
			if (TOKEN_AUTH.has(operation) && lacksToken(payload, operation)) throw missingTokenError(node, i);
			body = JSON.stringify(payload);
			headers['Content-Type'] = 'application/json';
		}
	}

	// Responses are read as text and parsed here: Export Events answers NDJSON, some
	// query operations CSV, and ingestion a bare 1 or 0, none of which is plain JSON.
	const options: IHttpRequestOptions = {
		method,
		url,
		headers,
		json: false,
		encoding: 'text',
		...(body !== undefined ? { body } : {}),
	};

	// HTTP errors are read here rather than thrown by n8n: n8n only keeps the body of an
	// error response when it was decoded as JSON, and these responses are read as text,
	// so Mixpanel's message would be lost before reaching the node.
	const failure = `Mixpanel API request failed: ${method} ${endpointPath.split('?')[0]}`;
	let full: { body?: unknown; statusCode?: number; headers?: IDataObject };
	try {
		full = (await this.helpers.httpRequestWithAuthentication.call(this, credentialType, {
			...options,
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
		})) as { body?: unknown; statusCode?: number; headers?: IDataObject };
	} catch (error) {
		throw new NodeApiError(node, error as JsonObject, {
			message: failure,
			description: describeApiError(error),
			itemIndex: i,
		});
	}

	const statusCode = Number(full?.statusCode ?? 200);
	if (statusCode >= 400) {
		const description = describeApiError({ response: { status: statusCode, data: full.body } });
		throw new NodeApiError(
			node,
			{ message: failure, description: description ?? '', httpCode: String(statusCode) } as JsonObject,
			{ message: failure, description, httpCode: String(statusCode), itemIndex: i },
		);
	}

	const result = normalizeResponse(full?.body);

	// Ingestion endpoints answer HTTP 200 even when they reject the data, and only say so
	// in the verbose status field.
	if (TOKEN_AUTH.has(operation) && !Array.isArray(result) && result.status === 0) {
		throw new NodeOperationError(node, `Mixpanel rejected the data: ${result.error ?? 'unknown error'}`, {
			itemIndex: i,
		});
	}

	return this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(result), {
		itemData: { item: i },
	});
}

function missingTokenError(node: INode, itemIndex: number): NodeOperationError {
	return new NodeOperationError(
		node,
		'This operation is authenticated by the project token, and the credential has none. Set Project Token in the credential, or add it to each record (properties.token for events, $token for profiles and groups)',
		{ itemIndex },
	);
}

function parseBody(this: IExecuteFunctions, i: number): IDataObject | IDataObject[] | undefined {
	const value = this.getNodeParameter('requestBody', i, '') as unknown;
	if (value !== null && typeof value === 'object') {
		return value as IDataObject | IDataObject[];
	}
	const raw = ((value as string) ?? '').trim();
	// An empty object is still sent: some endpoints, such as Query Audit Logs, require a
	// JSON body even when no filter is set.
	if (raw === '') return undefined;
	try {
		return JSON.parse(raw) as IDataObject | IDataObject[];
	} catch {
		throw new NodeOperationError(this.getNode(), 'Request Body is not valid JSON', { itemIndex: i });
	}
}

/**
 * Form fields from a JSON object. Mixpanel expects nested values (a JQL params object,
 * an output_properties array, a pipeline's credentials) as JSON strings.
 */
function toForm(fields: IDataObject): URLSearchParams {
	const form = new URLSearchParams();
	for (const [key, value] of Object.entries(fields)) {
		if (value === undefined || value === null) continue;
		form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
	}
	return form;
}

/**
 * Adds the project token from the credential to records that do not carry one: events
 * hold it in properties.token, profile and group updates in $token.
 */
function injectToken(
	payload: IDataObject | IDataObject[] | undefined,
	operation: string,
	token: string,
): IDataObject | IDataObject[] {
	const records = payload === undefined ? [] : Array.isArray(payload) ? payload : [payload];
	const inProperties =
		operation === 'trackEventsPost' ||
		operation === 'createIdentityPost' ||
		operation === 'createAliasPost';
	for (const record of records) {
		if (inProperties) {
			const properties = (record.properties ?? {}) as IDataObject;
			if (properties.token === undefined && token !== '') properties.token = token;
			record.properties = properties;
		} else if (record.$token === undefined && token !== '') {
			record.$token = token;
		}
	}
	return payload === undefined ? {} : payload;
}

/**
 * Whether a record still has no project token after injection. Mixpanel answers
 * "token, missing or empty" for those, which does not say where the token comes from.
 */
function lacksToken(payload: IDataObject | IDataObject[], operation: string): boolean {
	const records = Array.isArray(payload) ? payload : [payload];
	const inProperties =
		operation === 'trackEventsPost' ||
		operation === 'createIdentityPost' ||
		operation === 'createAliasPost';
	return records.some((record) => {
		const value = inProperties ? ((record.properties ?? {}) as IDataObject).token : record.$token;
		return value === undefined || value === null || String(value).trim() === '';
	});
}

/**
 * Status, Mixpanel error message and the first rejected records of a strict import, from
 * either an axios error or the NodeApiError httpRequestWithAuthentication wraps it in.
 * Falls back to the start of a non-JSON body, such as the export API's plain-text errors.
 */
function describeApiError(error: unknown): string | undefined {
	let err = (error ?? {}) as IDataObject;
	const outer = err;
	for (let depth = 0; depth < 5 && !err.response && err.cause; depth++) {
		err = err.cause as IDataObject;
	}
	const response = (err.response ?? {}) as IDataObject;
	const status = (response.status ?? err.statusCode ?? response.statusCode ?? outer.httpCode) as
		| number
		| string
		| undefined;
	let data = response.data ?? response.body ?? err.error ?? (outer.context as IDataObject | undefined)?.data;
	if (typeof data === 'string') {
		try {
			data = JSON.parse(data);
		} catch {
			// not JSON: kept as text below
		}
	}

	const parts: string[] = [];
	if (status) parts.push(`HTTP ${status}`);
	// Mixpanel answers 402 with an empty body when the API is not part of the plan.
	if (Number(status) === 402) {
		parts.push(
			'This API is not included in the Mixpanel plan of the project. The Query API (reports, segmentation, retention, funnels, event breakdown) needs a Growth or Enterprise plan',
		);
	}
	if (data && typeof data === 'object' && !Array.isArray(data)) {
		const body = data as IDataObject;
		// The data pipelines API spells it Error, the other APIs error.
		const apiError = body.error ?? body.Error;
		if (typeof apiError === 'string') parts.push(apiError);
		else if (apiError && typeof apiError === 'object') parts.push(JSON.stringify(apiError));
		if (typeof body.message === 'string') parts.push(body.message);
		if (typeof body.detail === 'string') parts.push(body.detail);
		if (Array.isArray(body.failed_records)) {
			const failed = body.failed_records as IDataObject[];
			for (const record of failed.slice(0, 10)) {
				parts.push(`record ${record.index ?? '?'} ${record.field ?? ''}: ${record.message ?? JSON.stringify(record)}`);
			}
			if (failed.length > 10) parts.push(`and ${failed.length - 10} more rejected records`);
		}
	} else if (typeof data === 'string' && data.trim() !== '') {
		parts.push(data.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300));
	}
	return parts.length > 0 ? parts.join(' | ') : undefined;
}

function normalizeResponse(response: unknown): IDataObject | IDataObject[] {
	if (response === null || response === undefined) {
		return { success: true };
	}
	if (typeof response !== 'string') {
		return toItems(response);
	}

	const text = response.trim();
	if (text === '') {
		return { success: true };
	}
	try {
		return toItems(JSON.parse(text));
	} catch {
		// not a single JSON document: NDJSON or text below
	}

	// Export Events answers one JSON event per line.
	const lines = text.split('\n').filter((line) => line.trim() !== '');
	try {
		return lines.map((line) => JSON.parse(line) as IDataObject);
	} catch {
		return { data: text };
	}
}

function toItems(value: unknown): IDataObject | IDataObject[] {
	if (Array.isArray(value)) {
		return value.map((entry) =>
			entry !== null && typeof entry === 'object' ? (entry as IDataObject) : { value: entry },
		);
	}
	if (value !== null && typeof value === 'object') {
		return value as IDataObject;
	}
	// Ingestion endpoints called without verbose answer a bare 1 (accepted) or 0.
	return { result: value as string | number | boolean };
}
