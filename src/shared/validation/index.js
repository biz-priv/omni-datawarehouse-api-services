const Joi = require("joi");

const schema = Joi.object({
  headers: Joi.object({
    "x-api-key": Joi.string().required()
  }).unknown(true),
  pathParameters: Joi.object({
    "customerID": Joi.string().required()
  })
}).unknown(true)

module.exports = {schema};
