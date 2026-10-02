import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
	Icon,
} from 'n8n-workflow';

// Expression used by the credential test, which cannot reach the node's host table.
const QUERY_HOST_EXPRESSION =
	'={{$credentials.region === "eu" ? "https://eu.mixpanel.com" : $credentials.region === "in" ? "https://in.mixpanel.com" : "https://mixpanel.com"}}/api/query';

export class MixpanelProjectSecretApi implements ICredentialType {
	name = 'mixpanelProjectSecretApi';
	displayName = 'Mixpanel Project Secret API';
	documentationUrl = 'https://developer.mixpanel.com/reference/project-secret';
	icon: Icon = { light: 'file:icons/mixpanel.svg', dark: 'file:icons/mixpanel.dark.svg' };

	properties: INodeProperties[] = [
		{
			displayName: 'Region',
			name: 'region',
			type: 'options',
			options: [
				{ name: 'US', value: 'us' },
				{ name: 'EU', value: 'eu' },
				{ name: 'India', value: 'in' },
			],
			default: 'us',
			description:
				'Data residency of the project, shown in Project Settings. An EU project only answers on the EU hosts.',
		},
		{
			displayName: 'API Secret',
			name: 'apiSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Project secret, shown in Project Settings. Mixpanel considers it legacy: prefer a service account, which the management APIs require anyway.',
		},
		{
			displayName: 'Project ID',
			name: 'projectId',
			type: 'string',
			default: '',
			description:
				'Numeric ID of the project, shown in Project Settings. Only used by the operations whose path contains it.',
		},
		{
			displayName: 'Project Token',
			name: 'projectToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'Project token, shown in Project Settings. Only needed by Track Events, the user and group profile operations, Identity and Evaluate Feature Flags, which authenticate with it.',
		},
	];

	// The secret is the Basic auth username, with an empty password.
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			auth: {
				username: '={{$credentials.apiSecret}}',
				password: '',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			method: 'GET',
			baseURL: QUERY_HOST_EXPRESSION,
			url: '/events/names',
			qs: { type: 'general', limit: 1 },
		},
	};
}
