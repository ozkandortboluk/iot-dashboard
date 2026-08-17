const fs = require('fs');
let code = fs.readFileSync('src/server/db.ts', 'utf8');

const replacement = `  public getUsers(): User[] { return this.userRepository.getUsers(); }
  public createSession(user: User): string { return this.userRepository.createSession(user); }
  public verifySession(token: string): { user: User; session?: UserSession } | null { return this.userRepository.verifySession(token); }
  public authenticate(email: string, pass: string): { user: User; token: string } | null { return this.userRepository.authenticate(email, pass); }
  public registerUser(name: string, email: string, pass: string, role: User['role'] = 'customer', companyName?: string): User { return this.userRepository.registerUser(name, email, pass, role, companyName); }
  public updateUserRole(userId: string, newRole: User['role']): User { return this.userRepository.updateUserRole(userId, newRole); }
  public deleteUser(userId: string) { return this.userRepository.deleteUser(userId); }
  // Devices`;

// We use regex to replace from "public getUsers(): User[]" to "// Devices"
code = code.replace(/  public getUsers\(\): User\[\] \{.*?\/\/ Devices/s, replacement);

fs.writeFileSync('src/server/db.ts', code);
