const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    uri: String,
    type: {
        type: String,
        required: true
    },
    tries: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastModifiedAt: {
        type: Date,
        default: Date.now
    },
    uniqueValue: {
        type: String,
        unique: true,
        index: true,
        required: true
    },
    connectionStatus: {
        type: Boolean,
        default: false
    },
    history: [
        {
            createdAt: {
                type: Date,
                default: Date.now
            },
            status: {
                type: Boolean,
                required: true
            }
        }
    ]
});

const Config = mongoose.model('Config', userSchema);

module.exports.ConfigModel = Config;
