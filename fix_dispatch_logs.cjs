const fs = require('fs');
let code = fs.readFileSync('src/server/db.ts', 'utf8');

const regex = /public getDispatchLogs\(requestingUserId = 'usr_admin', targetCustomerId\?: string, options\?: \{ limit\?: number; cursor\?: string; status\?: string; channel\?: string; search\?: string \}\): any \{/;

const replacement = `public async getDispatchLogs(requestingUserId = 'usr_admin', targetCustomerId?: string, options?: { limit?: number; cursor?: string; status?: string; channel?: string; search?: string }): Promise<any> {
    if (this.isPostgresProductionMode()) {
       let list = await this.postgresRepo.getDispatchLogs(targetCustomerId || requestingUserId);
       if (options?.status && options.status !== 'all') list = list.filter((l: any) => l.status === options.status);
       if (options?.channel && options.channel !== 'all') list = list.filter((l: any) => l.channel === options.channel);
       return { data: list, total: list.length, limit: options?.limit || 50, hasMore: false };
    }
`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/server/db.ts', code);
