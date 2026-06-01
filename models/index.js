const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';
const config = require(__dirname + '/../config/config.js')[env];
const db = {};

// Initialize Sequelize
let sequelize;

if (config.use_env_variable) {
    sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
    sequelize = new Sequelize(config.database, config.username, config.password, config);
}

// Dynamically load all models
fs.readdirSync(__dirname)
    .filter(file => {
        return (
            file.indexOf('.') !== 0 &&
            file !== basename &&
            file.slice(-3) === '.js' &&
            file.indexOf('.test.js') === -1
        );
    })
    .forEach(file => {
        const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
        db[model.name] = model;
    });

// Note: We are intentionally skipping the setup of model associations.
// Normally you might run something like the following, but here we comment it out:
Object.keys(db).forEach(modelName => {
    console.log(modelName);
    if (db[modelName].associate) {
        db[modelName].associate(db);
    }
});

// Instead, we selectively migrate (sync) only those models that do NOT define associations.
// This assumes that if a model has an association (an "associate" method), its migration is handled separately.
const modelsToSync = Object.keys(db).filter(modelName => typeof db[modelName].associate !== 'function');

// Promise.all(
//     modelsToSync.map(modelName => db[modelName].sync())
// )
//     .then(() => {
//         console.log("Models without associations have been synchronized.");
//     })
//     .catch(err => {
//         console.error("Error synchronizing models:", err);
//     });

// Export Sequelize and the db object with models attached.
db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
