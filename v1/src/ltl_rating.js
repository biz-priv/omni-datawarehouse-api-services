const Joi = require("joi");
const { get, includes } = require("lodash");
const { v4 } = require("uuid");
const xml2js = require("xml2js");
const axios = require("axios");
const moment = require("moment");
const qs = require("qs");
const { zips } = require("../../src/shared/ltlRater/zipCode.js");

const ltlRateRequestSchema = Joi.object({
    ltlRateRequest: Joi.object({
        pickupTime: Joi.string().required().label("pickupTime"),
        reference: Joi.string().required().label("Reference").length(36),
        insuredValue: Joi.number().optional().label("insuredValue is invalid."),
        shipperZip: Joi.string()
            .required()
            // .length(10)
            .label("shipperZip is invalid."),
        consigneeZip: Joi.string()
            .required()
            // .length(10)
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
    responseBodyFormat["ltlRateResponse"] = [];
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
        const ltlRateRequest = get(body, "ltlRateRequest");
        const pickupTime = get(ltlRateRequest, "pickupTime");
        const insuredValue = get(ltlRateRequest, "insuredValue");
        const shipperZip = get(ltlRateRequest, "shipperZip");
        const consigneeZip = get(ltlRateRequest, "consigneeZip");
        const shipmentLines = get(ltlRateRequest, "shipmentLines", []);
        const accessorialList = get(ltlRateRequest, "accessorialList", []);
        const reference = get(ltlRateRequest, "reference", []);

        responseBodyFormat["transactionId"] = reference;

        const apiResponse = await Promise.all(
            ["FWDA", "EXLA", "FEXF"].map(async (carrier) => {
                if (carrier === "FWDA") {
                    console.log(
                        `🙂 -> file: ltl_rating.js:81 -> carrier:`,
                        carrier
                    );
                    return await processFWDARequest({
                        pickupTime,
                        insuredValue,
                        shipperZip,
                        consigneeZip,
                        shipmentLines,
                        accessorialList,
                    });
                }
                if (carrier === "EXLA") {
                    console.log(
                        `🙂 -> file: ltl_rating.js:92 -> carrier:`,
                        carrier
                    );
                    return await processEXLARequest({
                        pickupTime,
                        insuredValue,
                        shipperZip,
                        consigneeZip,
                        shipmentLines,
                        accessorialList,
                        reference,
                    });
                }
                if (carrier === "FEXF") {
                    console.log(
                        `🙂 -> file: ltl_rating.js:92 -> carrier:`,
                        carrier
                    );
                    return await processFEXFRequest({
                        pickupTime,
                        insuredValue,
                        shipperZip,
                        consigneeZip,
                        shipmentLines,
                        accessorialList,
                        reference,
                    });
                }
            })
        );
        console.log(
            `🙂 -> file: ltl_rating.js:84 -> apiResponse:`,
            apiResponse
        );
        const response = { ...responseBodyFormat };
        console.log(`🙂 -> file: ltl_rating.js:116 -> response:`, response);

        return response;
    } catch (err) {
        console.error(`🙂 -> file: ltl_rating.js:95 -> err:`, err);
        const response = {
            statusCode: 400,
            body: { message: err.message },
        };
        return response;
    }
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
                    "rat1:fullCommodities": { "rat1:commodity": [] },
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
    FEXF: {
        accountNumber: {
            value: "",
        },
        rateRequestControlParameters: {
            returnTransitTimes: "",
            servicesNeededOnRateFailure: "",
            rateSortOrder: "",
        },
        freightRequestedShipment: {
            shipper: {
                address: {
                    city: "",
                    stateOrProvinceCode: "",
                    postalCode: "",
                    countryCode: "",
                    residential: "",
                },
            },
            recipient: {
                address: {
                    city: "San Francisco",
                    stateOrProvinceCode: "",
                    postalCode: "",
                    countryCode: "",
                    residential: "",
                },
            },

            shippingChargesPayment: {
                payor: {
                    responsibleParty: {
                        address: {
                            city: "HOUSTON",
                            stateOrProvinceCode: "",
                            postalCode: "",
                            countryCode: "",
                            residential: "",
                        },
                        accountNumber: {
                            value: "",
                        },
                    },
                },
            },
            rateRequestType: [],
            shipDateStamp: "",
            requestedPackageLineItems: [],
            totalPackageCount: "",
            totalWeight: "",
            freightShipmentDetail: {
                role: "",
                accountNumber: {
                    value: "",
                },
                shipmentDimensions: {
                    length: "",
                    width: "",
                    height: "",
                    units: "",
                },
                lineItem: [],
                fedExFreightBillingContactAndAddress: {
                    address: {
                        city: "",
                        stateOrProvinceCode: "",
                        postalCode: "",
                        countryCode: "",
                    },
                    accountNumber: {
                        value: "",
                    },
                },
                alternateBillingParty: {
                    address: {
                        city: "",
                        stateOrProvinceCode: "",
                        postalCode: "",
                        countryCode: "",
                    },
                    accountNumber: {
                        value: "",
                    },
                },
            },
            freightShipmentSpecialServices: {
                specialServiceTypes: [],
            },
        },
    },
};

const responseBodyFormat = {
    transactionId: v4(),
    ltlRateResponse: [],
};

async function processFWDARequest({
    pickupTime,
    insuredValue,
    shipperZip,
    consigneeZip,
    shipmentLines,
    accessorialList,
}) {
    const xmlPayload = getXmlPayloadFWDA({
        pickupTime,
        insuredValue,
        shipperZip,
        consigneeZip,
        shipmentLines,
        accessorialList,
    });
    let url;
    let headers = {};
    let payload = "";
    url = "https://api.forwardair.com/ltlservices/v2/rest/waybills/quote";
    headers = {
        user: "omniliah",
        password: "TVud61y6caRfSnjT",
        customerId: "OMNILIAH",
        "Content-Type": "application/xml",
    };
    payload = xmlPayload;
    const response = await axiosRequest(url, payload, headers);
    if (!response) return false;
    await processFWDAResponses({ response });
    return { response };
}

async function processFWDAResponses({ response }) {
    console.log(`🙂 -> file: ltl_rating.js:103 -> response:`, response);
    let parser = new xml2js.Parser({ trim: true });
    const parsed = await parser.parseStringPromise(response);
    const FAQuoteResponse = get(parsed, "FAQuoteResponse", {});
    const ChargeLineItems = get(
        FAQuoteResponse,
        "ChargeLineItems[0].ChargeLineItem",
        []
    );
    const data = {
        carrier: "FWDA",
        serviceLevel: get(ChargeLineItems, "[0].ServiceLevel[0]", "0"),
        serviceLevelDescription: "",
        transitDays: get(FAQuoteResponse, "TransitDaysTotal[0]"),
        totalRate: get(FAQuoteResponse, "QuoteTotal[0]"),
        message: "",
        accessorialList: [],
    };
    data["accessorialList"] = ChargeLineItems.map((chargeLineItem) => ({
        code: get(chargeLineItem, "Code[0]"),
        description: get(chargeLineItem, "Description[0]"),
        charge: get(chargeLineItem, "Amount[0]"),
    }));
    responseBodyFormat["ltlRateResponse"].push(data);
    console.log(
        `🙂 -> file: ltl_rating.js:127 -> responseBodyFormat:`,
        responseBodyFormat
    );
}

function getXmlPayloadFWDA({
    pickupTime,
    insuredValue,
    shipperZip,
    consigneeZip,
    shipmentLines,
    accessorialList,
}) {
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

    xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["Hazmat"] = "N";
    xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["InBondShipment"] = "N";
    xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["DeclaredValue"] = insuredValue;
    xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["ShippingDate"] = pickupTime;

    for (let index = 0; index < shipmentLines.length; index++) {
        const shipmentLine = shipmentLines[index];
        xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["FreightDetails"][
            "FreightDetail"
        ][index] = {
            Weight: get(shipmentLine, "weight"),
            WeightType:
                unitMapping["FWDA"][get(shipmentLine, "weightUOM")] ??
                get(shipmentLine, "weightUOM"),
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

    const builder = new xml2js.Builder({
        xmldec: { version: "1.0", encoding: "UTF-8" },
    });
    console.log(
        `🙂 -> file: index.js:223 -> xmlPayloadFormat.FWDA:`,
        JSON.stringify(xmlPayloadFormat.FWDA)
    );
    return builder.buildObject(xmlPayloadFormat.FWDA);
}

async function processEXLARequest({
    pickupTime,
    insuredValue,
    shipperZip,
    consigneeZip,
    shipmentLines,
    accessorialList,
    reference,
}) {
    const xmlPayload = getXmlPayloadEXLA({
        pickupTime,
        insuredValue,
        shipperZip,
        consigneeZip,
        shipmentLines,
        accessorialList,
        reference,
    });
    let headers = {
        soapAction: "http://ws.estesexpress.com/ratequote/getQuote",
        "Content-Type": "text/xml",
    };
    let url =
        "https://www.estes-express.com/tools/rating/ratequote/v4.0/services/RateQuoteService";
    let payload = xmlPayload;
    const response = await axiosRequest(url, payload, headers);
    if (!response) return false;
    await processEXLAResponses({ response });
    return { response };
}

async function processEXLAResponses({ response }) {
    console.log(`🙂 -> file: ltl_rating.js:103 -> response:`, response);
    let parser = new xml2js.Parser({ trim: true });
    const parsed = await parser.parseStringPromise(response);
    console.log(
        `🙂 -> file: ltl_rating.js:425 -> parsed:`,
        JSON.stringify(parsed)
    );
    const Envelope = get(parsed, "soapenv:Envelope", {});
    const Body = get(Envelope, "soapenv:Body[0]", {});
    const rateQuote = get(Body, "rat:rateQuote[0]", {});
    const quoteInfo = get(rateQuote, "rat:quoteInfo[0]", "");
    const quote = get(quoteInfo, "rat:quote", []);

    const quoteList = quote.map((quoteInfo) => {
        const serviceLevel = get(
            quoteInfo,
            "rat:serviceLevel[0].rat:id[0]",
            "0"
        );
        const quoteNumber = get(quoteInfo, "rat:quoteNumber[0]", "0");
        const pickup = get(quoteInfo, "rat:pickup[0].rat:date[0]", "0");
        const pickupDate = moment(new Date(pickup));
        const delivery = get(quoteInfo, "rat:delivery[0].rat:date[0]", "0");
        const deliveryDate = moment(new Date(delivery));
        const transitDays = deliveryDate.diff(pickupDate, "days");
        const totalRate = get(
            quoteInfo,
            "rat:pricing[0].rat:totalPrice[0]",
            "0"
        );
        const accessorialInfo = get(
            quoteInfo,
            "rat:accessorialInfo[0].rat:accessorial",
            []
        );

        const data = {
            carrier: "EXLA",
            quoteNumber,
            serviceLevel,
            serviceLevelDescription: "",
            transitDays: transitDays,
            totalRate,
            message: "",
            accessorialList: [],
        };
        data["accessorialList"] = accessorialInfo.map((accessorial) => ({
            code: get(accessorial, "rat:code[0]"),
            description: get(accessorial, "rat:description[0]"),
            charge: get(accessorial, "rat:charge[0]"),
        }));
        return data;
    });
    console.log(`🙂 -> file: ltl_rating.js:464 -> quoteList:`, quoteList);
    responseBodyFormat["ltlRateResponse"] = [
        ...responseBodyFormat["ltlRateResponse"],
        ...quoteList,
    ];
    console.log(
        `🙂 -> file: ltl_rating.js:127 -> responseBodyFormat:`,
        responseBodyFormat
    );
}

function getXmlPayloadEXLA({
    pickupTime,
    insuredValue,
    shipperZip,
    consigneeZip,
    shipmentLines,
    accessorialList,
    reference,
}) {
    // For ESTES
    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Header"]["rat:auth"][
        "rat:user"
    ] = "omni2";

    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Header"]["rat:auth"][
        "rat:password"
    ] = "OmniAllin1";

    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"][
        "rat1:rateRequest"
    ]["rat1:requestID"] = reference;

    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"][
        "rat1:rateRequest"
    ]["rat1:originPoint"]["rat1:countryCode"] = "US";

    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"][
        "rat1:rateRequest"
    ]["rat1:originPoint"]["rat1:postalCode"] = shipperZip;

    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"][
        "rat1:rateRequest"
    ]["rat1:destinationPoint"]["rat1:countryCode"] = "US";

    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"][
        "rat1:rateRequest"
    ]["rat1:destinationPoint"]["rat1:postalCode"] = consigneeZip;

    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"][
        "rat1:rateRequest"
    ]["rat1:payor"] = "T";

    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"][
        "rat1:rateRequest"
    ]["rat1:terms"] = "PPD";

    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"][
        "rat1:rateRequest"
    ]["rat1:pickup"]["rat1:date"] = pickupTime.split("T")[0];

    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"][
        "rat1:rateRequest"
    ]["rat1:pickup"]["rat1:ready"] = pickupTime.split("T")[1];

    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"][
        "rat1:rateRequest"
    ]["rat1:declaredValue"] = insuredValue;

    for (const accessorial of accessorialList) {
        xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"][
            "rat1:rateRequest"
        ]["rat1:accessorials"]["rat1:accessorialCode"] =
            accessorialMappingEXLA[accessorial];
    }

    if (get(shipmentLines, "[0].hazmat") === true) {
        xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"][
            "rat1:rateRequest"
        ]["rat1:accessorials"]["rat1:accessorialCode"].push("HAZ");
    }

    for (let index = 0; index < shipmentLines.length; index++) {
        const shipmentLine = shipmentLines[index];

        xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"][
            "rat1:rateRequest"
        ]["rat1:fullCommodities"]["rat1:commodity"][index] = {
            "rat1:class": get(shipmentLine, "freightClass"),
            "rat1:weight": get(shipmentLine, "weight"),
            "rat1:pieces": get(shipmentLine, "pieces"),
            "rat1:pieceType":
                pieceTypeMappingEXLA[get(shipmentLine, "pieceType")],
            "rat1:dimensions": {
                "rat1:length": get(shipmentLine, "length"),
                "rat1:width": get(shipmentLine, "width"),
                "rat1:height": get(shipmentLine, "height"),
            },
        };
    }
    const builder = new xml2js.Builder({
        xmldec: { version: "1.0", encoding: "UTF-8" },
    });
    console.log(
        `🙂 -> file: index.js:223 -> xmlPayloadFormat.FWDA:`,
        JSON.stringify(xmlPayloadFormat.EXLA)
    );
    return builder.buildObject(xmlPayloadFormat.EXLA);
}

async function processFEXFRequest({
    pickupTime,
    insuredValue,
    shipperZip,
    consigneeZip,
    shipmentLines,
    accessorialList,
    reference,
}) {
    const accessToken = await processFEXFAuthRequest();
    const payload = getXmlPayloadFEXF({
        pickupTime,
        insuredValue,
        shipperZip,
        consigneeZip,
        shipmentLines,
        accessorialList,
        reference,
    });
    console.log(`🙂 -> file: ltl_rating.js:753 -> payload:`, payload);
    let headers = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
    };
    let url = "https://apis.fedex.com/rate/v1/freight/rates/quotes";
    const response = await axiosRequest(url, payload, headers);
    console.log(`🙂 -> file: ltl_rating.js:760 -> response:`, response);
    if (!response) return false;
    processFEXFResponses({ response });
    return { response };
}

async function processFEXFAuthRequest() {
    let data = qs.stringify({
        grant_type: "client_credentials",
        client_id: "l789c1e90d306b419bb8870284bdea1e7b",
        client_secret: "810186e0a5c2488289753bae1e8507a8",
    });
    let config = {
        method: "post",
        maxBodyLength: Infinity,
        url: "https://apis.fedex.com/oauth/token",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data: data,
    };
    const authReqRes = await axios.request(config);
    return get(authReqRes, "data.access_token");
}

function getXmlPayloadFEXF({
    pickupTime,
    insuredValue,
    shipperZip,
    consigneeZip,
    shipmentLines,
    accessorialList,
    reference,
}) {
    const shipper = zips[shipperZip];
    const consignee = zips[consigneeZip];

    xmlPayloadFormat["FEXF"]["accountNumber"]["value"] = 226811362;
    xmlPayloadFormat["FEXF"]["rateRequestControlParameters"][
        "returnTransitTimes"
    ] = true;
    xmlPayloadFormat["FEXF"]["rateRequestControlParameters"][
        "servicesNeededOnRateFailure"
    ] = true;
    xmlPayloadFormat["FEXF"]["rateRequestControlParameters"]["rateSortOrder"] =
        "SERVICENAMETRADITIONAL";

    xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["shipper"]["address"] =
        {
            city: get(shipper, "city"),
            stateOrProvinceCode: get(shipper, "state"),
            postalCode: get(shipper, "zip_code"),
            countryCode: "US",
            residential: false,
        };
    xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["recipient"][
        "address"
    ] = {
        city: get(consignee, "city"),
        stateOrProvinceCode: get(consignee, "state"),
        postalCode: get(consignee, "zip_code"),
        countryCode: "US",
        residential: false,
    };

    xmlPayloadFormat["FEXF"]["freightRequestedShipment"][
        "shippingChargesPayment"
    ]["payor"]["responsibleParty"]["address"] = {
        city: "HOUSTON",
        stateOrProvinceCode: "TX",
        postalCode: "77032",
        countryCode: "US",
        residential: false,
    };
    xmlPayloadFormat["FEXF"]["freightRequestedShipment"][
        "shippingChargesPayment"
    ]["payor"]["responsibleParty"]["accountNumber"]["value"] = 554332390;

    xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["rateRequestType"] = [
        "ACCOUNT",
    ];

    xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["shipDateStamp"] =
        pickupTime.split("T")[0];
    let totalPackageCount = 0;
    let totalWeight = 0;
    for (let index = 0; index < shipmentLines.length; index++) {
        const shipmentLine = shipmentLines[index];
        console.log(
            `🙂 -> file: ltl_rating.js:848 -> shipmentLine:`,
            shipmentLine
        );
        const pieceType =
            pieceTypeMappingFEXF[
                get(shipmentLine, "pieceType", "").toUpperCase()
            ];
        const pieces = get(shipmentLine, "pieces");
        const weight = get(shipmentLine, "weight");
        const weightUOM = unitMapping["FEXF"][get(shipmentLine, "weightUOM")];
        const length = get(shipmentLine, "length");
        const width = get(shipmentLine, "width");
        const height = get(shipmentLine, "height");
        const dimUOM = unitMapping["FEXF"][get(shipmentLine, "dimUOM")];
        const hazmat = get(shipmentLine, "hazmat", false);
        const freightClass = get(shipmentLine, "freightClass");
        totalPackageCount += Number(pieces);
        totalWeight += Number(weight);
        const packageLineItem = {
            subPackagingType: pieceType,
            groupPackageCount: pieces,
            declaredValue: {
                amount: insuredValue,
                currency: "USD",
            },
            weight: {
                units: weightUOM,
                value: weight,
            },
            dimensions: {
                length,
                width,
                height,
                units: unitMapping["FEXF"][dimUOM],
            },
            associatedFreightLineItems: [
                {
                    id: index + 1,
                },
            ],
        };
        xmlPayloadFormat["FEXF"]["freightRequestedShipment"][
            "requestedPackageLineItems"
        ].push(packageLineItem);

        const lineItems = {
            subPackagingType: pieceType,
            weight: {
                units: weightUOM,
                value: weight,
            },
            pieces: pieces,
            freightClass: freightClassFEXF[freightClass],
            id: "1",
            hazardousMaterials: hazmat ? "HAZARDOUS_MATERIALS" : hazmat,
            dimensions: {
                length,
                width,
                height,
                units: dimUOM,
            },
        };
        xmlPayloadFormat["FEXF"]["freightRequestedShipment"][
            "freightShipmentDetail"
        ]["lineItem"].push(lineItems);
    }
    xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["totalPackageCount"] =
        totalPackageCount;
    xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["totalWeight"] =
        totalWeight;
    xmlPayloadFormat["FEXF"]["freightRequestedShipment"][
        "freightShipmentDetail"
    ]["role"] = "SHIPPER";
    xmlPayloadFormat["FEXF"]["freightRequestedShipment"][
        "freightShipmentDetail"
    ]["accountNumber"] = { value: "226811362" };
    xmlPayloadFormat["FEXF"]["freightRequestedShipment"][
        "freightShipmentDetail"
    ]["shipmentDimensions"] = {
        length: get(shipmentLines, "[0].length"),
        width: get(shipmentLines, "[0].width"),
        height: get(shipmentLines, "[0].height"),
        units: unitMapping["FEXF"][get(shipmentLines, "[0].dimUOM")],
    };
    xmlPayloadFormat["FEXF"]["freightRequestedShipment"][
        "freightShipmentDetail"
    ]["fedExFreightBillingContactAndAddress"]["address"] = {
        city: "HOUSTON",
        stateOrProvinceCode: "TX",
        postalCode: "77032",
        countryCode: "US",
        residential: false,
    };
    xmlPayloadFormat["FEXF"]["freightRequestedShipment"][
        "freightShipmentDetail"
    ]["fedExFreightBillingContactAndAddress"]["accountNumber"] = {
        value: "554332390",
    };
    xmlPayloadFormat["FEXF"]["freightRequestedShipment"][
        "freightShipmentDetail"
    ]["alternateBillingParty"]["address"] = {
        city: "HOUSTON",
        stateOrProvinceCode: "TX",
        postalCode: "77032",
        countryCode: "US",
        residential: false,
    };
    xmlPayloadFormat["FEXF"]["freightRequestedShipment"][
        "freightShipmentDetail"
    ]["alternateBillingParty"]["accountNumber"] = {
        value: "554332390",
    };
    xmlPayloadFormat["FEXF"]["freightRequestedShipment"][
        "freightShipmentSpecialServices"
    ]["specialServiceTypes"] = accessorialList.map((acc) =>
        Object.keys(accessorialMappingFEXF).includes(acc)
            ? accessorialMappingFEXF[acc]
            : ""
    );
    return xmlPayloadFormat["FEXF"];
}

function processFEXFResponses({ response }) {
    const output = get(response, "output");
    const rateReplyDetails = get(output, "rateReplyDetails", []);
    rateReplyDetails.map((rateReplyDetail) => {
        const serviceLevel = get(rateReplyDetail, "serviceType");
        const transitDays = get(
            rateReplyDetail,
            "commit.transitDays.minimumTransitTime"
        );
        const ratedShipmentDetails = get(
            rateReplyDetail,
            "ratedShipmentDetails",
            []
        );
        ratedShipmentDetails.map((ratedShipmentDetail) => {
            const rateType = get(ratedShipmentDetail, "rateType", "");
            const quoteNumber = get(ratedShipmentDetail, "quoteNumber");
            const totalRate = get(ratedShipmentDetail, "totalNetCharge");
            const shipmentRateDetail = get(
                ratedShipmentDetail,
                "shipmentRateDetail.surCharges",
                []
            );

            const accessorialList = shipmentRateDetail.map((acc) => ({
                code: get(acc, "type"),
                description: get(acc, "description"),
                charge: get(acc, "amount"),
            }));
            const data = {
                serviceLevel,
                serviceLevelDescription: "",
                carrier: "FEXF",
                transitDays: transitDaysMappingFEXP[transitDays],
                quoteNumber,
                totalRate,
                accessorialList,
            };
            if (rateType.toUpperCase() === "ACCOUNT")
                return responseBodyFormat["ltlRateResponse"].push(data);
        });
    });
}

const accessorialMappingFWDA = {
    APPT: "APP",
    INSPU: "IPU",
    RESID: "RPU",

    APPTD: "ADE",
    INDEL: "IDE",
    RESDE: "RDE",
};

const accessorialMappingEXLA = {
    APPT: "APT",
    INSPU: "INP",
    RESID: "HPU",
    LIFT: "LGATEP",
    APPTD: "APT",
    INDEL: "INS",
    RESDE: "HD",
    LIFTD: "LGATE",
};

const unitMapping = {
    FWDA: {
        lb: "L",
    },
    FEXF: {
        lb: "LB",
        in: "IN",
    },
};

const pieceTypeMappingEXLA = {
    BND: "BD",
    BOX: "BX",
    CNT: "CN",
    CRT: "CR",
    CAS: "CS",
    CTN: "CT",
    PCE: "PC",
    PLT: "PT",
    REL: "RE",
    SKD: "SK",
    UNT: "PC",
};
const pieceTypeMappingFEXF = {
    BND: "BUNDLE",
    BOX: "BOX",
    CNT: "CONTAINER",
    CRT: "CRATE",
    CAS: "CASE",
    CTN: "CARTON",
    PCE: "PIECE",
    PLT: "PALLET",
    REL: "REEL",
    SKD: "SKID",
    UNT: "UNIT",
};

const freightClassFEXF = {
    50: "CLASS_050",
    55: "CLASS_055",
    60: "CLASS_060",
    65: "CLASS_065",
    70: "CLASS_070",
    77.5: "CLASS_077_5",
    85: "CLASS_085",
    92.5: "CLASS_092_5",
    100: "CLASS_100",
    110: "CLASS_110",
    125: "CLASS_125",
    150: "CLASS_150",
    175: "CLASS_175",
    200: "CLASS_200",
    250: "CLASS_250",
    300: "CLASS_300",
    400: "CLASS_400",
    500: "CLASS_500",
};

const accessorialMappingFEXF = {
    INSPU: "INSIDE_PICKUP",
    RESID: "LIMITED_ACCESS_PICKUP",
    LIFT: "LIFTGATE_PICKUP",
    APPTD: "CUSTOM_DELIVERY_WINDOW",
    INDEL: "INSIDE_DELIVERY",
    RESDE: "LIMITED_ACCESS_DELIVERY",
    LIFTD: "LIFTGATE_DELIVERY",
};

const transitDaysMappingFEXP = {
    EIGHT_DAYS: "8",
    EIGHTEEN_DAYS: "18",
    ELEVEN_DAYS: "11",
    FIFTEEN_DAYS: "15",
    FIVE_DAYS: "5",
    FOUR_DAYS: "4",
    FOURTEEN_DAYS: "14",
    NINE_DAYS: "9",
    NINETEEN_DAYS: "19",
    ONE_DAY: "1",
    SEVEN_DAYS: "7",
    SEVENTEEN_DAYS: "17",
    SIX_DAYS: "6",
    SIXTEEN_DAYS: "16",
    TEN_DAYS: "10",
    THIRTEEN_DAYS: "13",
    THREE_DAYS: "3",
    TWELVE_DAYS: "12",
    TWENTY_DAYS: "20",
    TWO_DAYS: "2",
    SMARTPOST_TRANSIT_DAYS: "7",
    UNKNOWN: "99",
};
async function axiosRequest(url, payload, header = {}) {
    try {
        let config = {
            method: "post",
            maxBodyLength: Infinity,
            url,
            headers: { ...header },
            data: payload,
        };

        const res = await axios.request(config);
        if (res.status === 200) {
            return get(res, "data", {});
        } else {
            return false;
        }
    } catch (e) {
        console.log(`🙂 -> file: ltl_rating.js:361 -> e:`, e);
        return false;
    }
}
