export interface UserSession {

    accessToken: string;

    refreshToken?: string;

    expiresAt: number;

    userName: string;

}