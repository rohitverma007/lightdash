import { AuthorizationError, formatDate } from '@lightdash/common';
import inquirer from 'inquirer';
import fetch from 'node-fetch';
import { URL } from 'url';
import { setContext, setDefaultUser } from '../config';
import * as styles from '../styles';
import { setProjectInteractively } from './setProject';

type LoginOptions = {
    token?: boolean;
};

const loginWithToken = async (url: string) => {
    const answers = await inquirer.prompt([
        {
            type: 'password',
            name: 'token',
            message: 'Enter your personal access token:',
        },
    ]);
    const { token } = answers;
    const userInfoUrl = new URL(`/api/v1/user`, url).href;
    const response = await fetch(userInfoUrl, {
        method: 'GET',
        headers: {
            Authorization: `ApiKey ${token}`,
            'Content-Type': 'application/json',
        },
    });
    const userBody = await response.json();
    const { userUuid } = userBody;
    return {
        userUuid,
        token,
    };
};

const loginWithPassword = async (url: string) => {
    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'email',
        },
        {
            type: 'password',
            name: 'password',
        },
    ]);
    const { email, password } = answers;
    const loginUrl = new URL(`/api/v1/login`, url).href;
    const response = await fetch(loginUrl, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        headers: {
            'Content-Type': 'application/json',
        },
    });
    const loginBody = await response.json();
    const header = response.headers.get('set-cookie');
    if (header === null) {
        throw new AuthorizationError(
            `Cannot sign in:\n${JSON.stringify(loginBody)}`,
        );
    }
    const { userUuid } = loginBody.results;
    const cookie = header.split(';')[0].split('=')[1];
    const patUrl = new URL(`/api/v1/user/me/personal-access-tokens`, url).href;
    const now = new Date();
    const description = `Generated by the Lightdash CLI on ${formatDate(now)}`;
    const expiresAt = new Date(now.setDate(now.getDate() + 30));
    const body = JSON.stringify({ expiresAt, description });
    const patResponse = await fetch(patUrl, {
        method: 'POST',
        body,
        headers: {
            'Content-Type': 'application/json',
            Cookie: `connect.sid=${cookie}`,
        },
    });
    const patResponseBody = await patResponse.json();
    const { token } = patResponseBody.results;
    return {
        userUuid,
        token,
    };
};

export const login = async (url: string, options: LoginOptions) => {
    const { userUuid, token } = options.token
        ? await loginWithToken(url)
        : await loginWithPassword(url);
    await setContext({ serverUrl: url, apiKey: token });
    await setDefaultUser(userUuid);

    console.error(`\n  ✅️ Login successful\n`);

    try {
        await setProjectInteractively();
    } catch (e: any) {
        if (e.statusCode === 404) {
            console.error(
                'Now you can add your first project to lightdash by doing: ',
            );
            console.error(
                `\n  ${styles.bold(`⚡️ lightdash deploy --create`)}\n`,
            );
        } else {
            console.error('Unable to select projects, try with: ');
            console.error(
                `\n  ${styles.bold(`⚡️ lightdash config set-project`)}\n`,
            );
        }
    }
};
