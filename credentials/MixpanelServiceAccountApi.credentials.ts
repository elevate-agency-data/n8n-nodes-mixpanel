import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
	Icon,
} from 'n8n-workflow';

// Expression used by the credential test, which cannot reach the node's host table.
const APP_HOST_EXPRESSION =
	'={{$credentials.region === "eu" ? "https://eu.mixpanel.com" : $credentials.region === "in" ? "https://in.mixpanel.com" : "https://mixpanel.com"}}/api/app';

export class MixpanelServiceAccountApi implements ICredentialType {
	name = 'mixpanelServiceAccountApi';
	displayName = 'Mixpanel Service Account API';
	documentationUrl = 'https://docs.mixpanel.com/reference/service-accounts';
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
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			required: true,
			description: 'Username of the service account, such as my-account.123456.mp-service-account',
		},
		{
			displayName: 'Secret',
			name: 'secret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Secret of the service account. Mixpanel only shows it once, when the account is created.',
		},
		{
			displayName: 'Project ID',
			name: 'projectId',
			type: 'string',
			default: '',
			required: true,
			description:
				'Numeric ID of the project, shown in Project Settings. The service account must be a member of this project.',
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

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			auth: {
				username: '={{$credentials.username}}',
				password: '={{$credentials.secret}}',
			},
		},
	};

	// GET /me lists the organizations and projects the service account belongs to.
	test: ICredentialTestRequest = {
		request: {
			method: 'GET',
			baseURL: APP_HOST_EXPRESSION,
			url: '/me',
		},
	};
}
