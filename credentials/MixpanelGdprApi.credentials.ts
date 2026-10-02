import { IAuthenticateGeneric, ICredentialType, INodeProperties, Icon } from 'n8n-workflow';

// The GDPR API is the only Mixpanel API authenticated by a personal OAuth token instead
// of a service account or a project secret, hence a credential of its own.
export class MixpanelGdprApi implements ICredentialType {
	name = 'mixpanelGdprApi';
	displayName = 'Mixpanel GDPR API';
	documentationUrl = 'https://developer.mixpanel.com/reference/gdpr-api';
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
			displayName: 'OAuth Token',
			name: 'oauthToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'OAuth token for the GDPR APIs: initials in the top right of Mixpanel > Profile & Preferences > Data & Privacy. Valid for one year.',
		},
		{
			displayName: 'Project Token',
			name: 'projectToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Token of the project the requests apply to, shown in Project Settings',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.oauthToken}}',
			},
		},
	};
}
