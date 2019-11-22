"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
index_1.calculateRate('ampl', '1d').then(result => {
    process.stdout.write(JSON.stringify(result, undefined, 2));
});
//# sourceMappingURL=cli.js.map