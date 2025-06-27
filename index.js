const {urlTest} = require("./testConfig");
const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/mydb')
    .then(async () => {

        }
    )
    .catch(err => console.error('Connection failed:', err));


// urlTest(
//     "vless://10525b84-7f6e-43ef-912b-87434df813f4@129.159.202.83:443?security=tls&sni=news5.testsnew.com&type=ws&path=%2Fwss#🔒 VL-WS-TLS 🇩🇪 DE-129.159.202.83:443"
// ).then(console.log).catch(console.error);