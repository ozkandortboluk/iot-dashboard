const bcrypt = require('bcryptjs');
const hash = '$2b$10$.7CbhEolsi0jYfpzeHLDBOz6c026SE5ZfH5Y3dOxhF9gcg.D0a0xy';
console.log("admin123:", bcrypt.compareSync('admin123', hash));
console.log("admin:", bcrypt.compareSync('admin', hash));
console.log("123456:", bcrypt.compareSync('123456', hash));
console.log("password:", bcrypt.compareSync('password', hash));
