/*
* File: src\shared\validation\index.js
* Project: Omni-datawarehouse-api-services
* Author: Bizcloud Experts
* Date: 2023-12-16
* Confidential and Proprietary
*/
const Joi = require("joi");

const schema = Joi.object({
    headers: Joi.object({
        "x-api-key": Joi.string().required(),
    }).unknown(true),
    pathParameters: Joi.object({
        customerID: Joi.string().required(),
    }),
    queryStringParameters: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        size: Joi.number().integer().min(1).default(10),
    })
        .empty(null)
        .default({ page: 1, size: 10 }),
}).unknown(true);

const ltlRateRequestSchema = Joi.object({
    ltlRateRequest: Joi.object({
        pickupTime: Joi.string().required().label("pickupTime"),
        reference: Joi.string().required().label("Reference"),
        insuredValue: Joi.number().optional().label("insuredValue"),
        shipperZip: Joi.string().required().label("shipperZip"),
        consigneeZip: Joi.string().required().label("consigneeZip"),
        shipmentLines: Joi.array()
            .max(99)
            .items(
                Joi.object({
                    pieces: Joi.number().required().label("pieces."),
                    pieceType: Joi.string().optional().label("pieceType."),
                    weight: Joi.number().required().label("weight."),
                    weightUOM: Joi.string().required().label("weightUOM."),
                    length: Joi.number().required().label("length."),
                    width: Joi.number().required().label("width."),
                    height: Joi.number().required().label("height."),
                    dimUOM: Joi.string().required().label("dimUOM."),
                    hazmat: Joi.boolean().optional().label("hazmat."),
                    freightClass: Joi.number().optional().label("freightClass."),
                })
            )
            .required()
            .label("shipmentLines"),
        accessorialList: Joi.array().items(Joi.string()).optional().label("accessorialList"),
    }),
});

module.exports = { schema, ltlRateRequestSchema };
