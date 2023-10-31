const Joi = require("joi");
const { get } = require("lodash");

const ltlRateRequestSchema = Joi.object({
    ltlRateRequest: Joi.object({
        pickupTime: Joi.string().required().label("pickupTime is invalid."),
        insuredValue: Joi.number().optional().label("insuredValue is invalid."),
        shipperZip: Joi.string()
            .required()
            .length(10)
            .label("shipperZip is invalid."),
        consigneeZip: Joi.string()
            .required()
            .length(10)
            .label("consigneeZip is invalid."),
        shipmentLines: Joi.array()
            .max(99)
            .items(
                Joi.object({
                    pieces: Joi.number().required().label("pieces is invalid."),
                    pieceType: Joi.string()
                        .optional()
                        .label("pieceType is invalid."),
                    weight: Joi.number().required().label("weight is invalid."),
                    weightUOM: Joi.string()
                        .required()
                        .label("weightUOM is invalid."),
                    length: Joi.number().required().label("length is invalid."),
                    width: Joi.number().required().label("width is invalid."),
                    height: Joi.number().required().label("height is invalid."),
                    dimUOM: Joi.string().required().label("dimUOM is invalid."),
                    hazmat: Joi.boolean()
                        .optional()
                        .label("hazmat is invalid."),
                    freightClass: Joi.number()
                        .optional()
                        .label("freightClass is invalid."),
                })
            )
            .required()
            .label("shipmentLines is invalid."),
        accessorialList: Joi.array()
            .items(Joi.string())
            .optional()
            .label("accessorialList is invalid."),
    }),
});

module.exports.handler = async (event, context) => {
    console.info(`🙂 -> file: ltl_rating.js:2 -> event:`, event);
    try {
        const validation = await ltlRateRequestSchema.validateAsync(
            get(event, "body")
        );
        console.info(`🙂 -> file: ltl_rating.js:32 -> validation:`, validation);
        const { error, value } = validation;
        console.info(`🙂 -> file: ltl_rating.js:57 -> error:`, error);
        console.info(`🙂 -> file: ltl_rating.js:57 -> value:`, value);
        if (error) throw error;
        const response = JSON.stringify({
            statusCode: 200,
            body: { hello: "world" },
        });
        return response;
    } catch (err) {
        const response = JSON.stringify({
            statusCode: 200,
            body: { message: err.message },
        });
        return response;
    }
};
