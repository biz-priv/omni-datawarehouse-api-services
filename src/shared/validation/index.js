const Joi = require("joi");

const schema = Joi.object({
  headers: Joi.object({
    "x-api-key": Joi.string().required()
  }).unknown(true),
  pathParameters: Joi.object({
    "customerID": Joi.string().required()
  }),
  queryStringParameters: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    size: Joi.number().integer().min(1).default(10),
}).empty(null).default({page: 1, size: 10})
}).unknown(true)

module.exports = {schema};
