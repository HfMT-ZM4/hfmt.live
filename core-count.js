const os = require("os")

console.log( `this system has ${os.cpus().length} cores` );

let id = "foo/#bar";
console.log(id.replace(/\/#/gi, ''));

const mediasoup = require('mediasoup');

