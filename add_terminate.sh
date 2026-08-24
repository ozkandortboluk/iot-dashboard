sed -i '/public async softDeleteUser/a \  public async terminateUserSessions(userId: string) { return this.userRepository.terminateUserSessions(userId); }' src/server/db.ts
