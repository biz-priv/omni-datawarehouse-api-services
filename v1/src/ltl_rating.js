const Joi = require("joi");
const { get } = require("lodash");
const { v4 } = require("uuid");

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
        const body = get(event, "body");
        const payload = getXmlPayload(body);
        const response = {
            statusCode: 200,
            body: payload,
        };
        return response;
    } catch (err) {
        const response = {
            statusCode: 200,
            body: { message: err.message },
        };
        return response;
    }
};

const responseBodyFormat = {
    transactionId: v4(),
    ltlRateResponse: [
        {
            carrier: "FWDA",
            serviceLevel: "0",
            serviceLevelDescription: "",
            estimatedDelivery: "",
            totalRate: 270,
            message: "",
            accessorialList: [
                {
                    code: "FSC",
                    description: "FUELSURCHARGE",
                    charge: 54,
                },
            ],
        },
    ],
};

const payloadMappingFormat = {
    shipperZip: "90210",
    accessorialList: ["APPT", "APPTD"],
    consigneeZip: "94132",
    shipmentLines: [
        {
            weight: 225,
            weightUOM: "lb",
            pieces: 3,
            freightClass: 70,
            length: 20,
            width: 20,
            height: 30,
            hazmat: false,
            insuredValue: 1000,
            pickupTime: "2023-11-02T17:00:00",
        },
    ],
};

const xmlPayloadFormat = {
    FWDA: {
        FAQuoteRequest: {
            BillToCustomerNumber: 2353722,
            Origin: {
                OriginZipCode: 90210,
                Pickup: {
                    AirportPickup: "N",
                    PickupAccessorials: {
                        PickupAccessorial: "APP",
                    },
                },
            },
            Destination: {
                DestinationZipCode: "94132",
                Delivery: {
                    AirportDelivery: "N",
                },
                DeliveryAccessorials: {
                    DeliveryAccessorial: "ADE",
                },
            },
            FreightDetails: {
                FreightDetail: [],
            },

            Dimensions: {
                Dimension: [],
            },
            Hazmat: "N",
            InBondShipment: "N",
            DeclaredValue: 10000.0,
            ShippingDate: "2020-11-02T17:00:00",
        },
    },
    EXLA: {
        "soapenv:Envelope": {
            $: {
                "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
                "xmlns:rat": "http://ws.estesexpress.com/ratequote",
                "xmlns:rat1":
                    "http://ws.estesexpress.com/schema/2019/01/ratequote",
            },
            "soapenv:Header": {
                "rat:auth": {
                    "rat:user": "omni2",
                    "rat:password": "OmniAllin1",
                },
            },
            "soapenv:Body": {
                "rat1:rateRequest": {
                    "rat1:requestID": "test",
                    "rat1:account": "5098931",
                    "rat1:originPoint": {
                        "rat1:countryCode": "US",
                        "rat1:postalCode": "90210",
                    },
                    "rat1:destinationPoint": {
                        "rat1:countryCode": "US",
                        "rat1:postalCode": "94132",
                    },
                    "rat1:payor": "T",
                    "rat1:terms": "PPD",
                    "rat1:pickup": {
                        "rat1:date": "2022-11-30",
                        "rat1:ready": "17:00:00",
                    },
                    "rat1:declaredValue": 1000,
                    "rat1:fullCommodities": [
                        {
                            "rat1:commodity": {
                                "rat1:class": 70,
                                "rat1:weight": 225,
                                "rat1:pieces": 3,
                                "rat1:pieceType": "PC",
                                "rat1:dimensions": {
                                    "rat1:length": 20,
                                    "rat1:width": 20,
                                    "rat1:height": 30,
                                },
                            },
                        },
                    ],
                    "rat1:accessorials": {
                        "rat1:accessorialCode": ["APT", "APT", "HAZ"],
                    },
                },
            },
        },
    },
    ODFL: {
        "soapenv:Envelope": {
            $: {
                "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
                "xmlns:myr": "http://myRate.ws.odfl.com/",
            },
            "soapenv:Header": "",
            "soapenv:Body": {
                "myr:getLTLRateEstimate": {
                    arg0: {
                        accessorials: ["IPC", "IDC", "HAZ"],
                        destinationPostalCode: 94132,
                        freightItems: {
                            height: 20,
                            width: 20,
                            numberOfUnits: 3,
                            ratedClass: 70,
                            weight: 255,
                        },
                        insuranceAmount: 1000,
                        odfl4MeUser: "OmniDFW",
                        odfl4MePassword: "Omnidfw1!",
                        odflCustomerAccount: "13469717",
                        originPostalCode: "90210",
                        pickupDateTime: "2023-10-01T14:00:00",
                        requestReferenceNumber: 1,
                        shipType: "LTL",
                        tariff: "559",
                    },
                },
            },
        },
    },
};

function getXmlPayload(body) {
    const ltlRateRequest = get(body, "ltlRateRequest");
    const pickupTime = get(ltlRateRequest, "pickupTime");
    const insuredValue = get(ltlRateRequest, "insuredValue");
    const shipperZip = get(ltlRateRequest, "shipperZip");
    const consigneeZip = get(ltlRateRequest, "consigneeZip");
    const shipmentLines = get(ltlRateRequest, "shipmentLines", []);
    const accessorialList = get(ltlRateRequest, "accessorialList", []);

    xmlPayloadFormat["FWDA"]["FAQuoteRequest"][
        "BillToCustomerNumber"
    ] = 2353722; //TODO: Move this to ssm;

    xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["Origin"]["OriginZipCode"] =
        shipperZip;

    xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["Origin"]["Pickup"][
        "AirportPickup"
    ] = "N";

    for (const accessorial of accessorialList) {
        if (["APPT", "INSPU", "RESID"].includes(accessorial)) {
            xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["Origin"]["Pickup"][
                "PickupAccessorials"
            ]["PickupAccessorial"] = accessorialMappingFWDA[accessorial];
        }
    }

    xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["Destination"][
        "DestinationZipCode"
    ] = consigneeZip;

    xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["Destination"]["Delivery"][
        "AirportDelivery"
    ] = "N";

    for (const accessorial of accessorialList) {
        if (["APPTD", "INDEL", "RESDE"].includes(accessorial)) {
            xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["Destination"][
                "DeliveryAccessorials"
            ]["DeliveryAccessorial"] = accessorialMappingFWDA[accessorial];
        }
    }

    for (let index = 0; index < shipmentLines.length; index++) {
        //todo: modify this block to use the same for loop for other carriers also
        const shipmentLine = shipmentLines[index];
        xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["FreightDetails"][
            "FreightDetail"
        ][index] = {
            Weight: get(shipmentLine, "weight"),
            WeightType: get(shipmentLine, "weightUOM"),
            Pieces: get(shipmentLine, "pieces"),
            FreightClass: get(shipmentLine, "freightClass"),
        };

        xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["Dimensions"]["Dimension"][
            index
        ] = {
            Pieces: get(shipmentLine, "pieces"),
            Length: get(shipmentLine, "length"),
            Width: get(shipmentLine, "width"),
            Height: get(shipmentLine, "height"),
        };
    }

    xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["Hazmat"] = "N";
    xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["InBondShipment"] = "N";
    xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["DeclaredValue"] = insuredValue;
    xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["ShippingDate"] = pickupTime;

    const builder = new xml2js.Builder({
        xmldec: { version: "1.0", encoding: "UTF-8" },
    });
    console.log(
        `🙂 -> file: index.js:223 -> xmlPayloadFormat.FWDA:`,
        JSON.stringify(xmlPayloadFormat.FWDA)
    );
    const xml = builder.buildObject(xmlPayloadFormat.FWDA);
    return xml;
}

const accessorialMappingFWDA = {
    APPT: "APP",
    INSPU: "IPU",
    RESID: "RPU",

    APPTD: "ADE",
    INDEL: "IDE",
    RESDE: "RDE",
};
