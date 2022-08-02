const Joi = require("joi");

const schema = Joi.object({
  headers: Joi.object({
    "x-api-key": Joi.string().required()
  }).unknown(true),
  pathParameters: Joi.object({
    "customerID": Joi.string().required()
  })
}).unknown(true)

const pageAndSizeValidator = Joi.number().integer().invalid(0).optional();
module.exports = {schema, pageAndSizeValidator};
