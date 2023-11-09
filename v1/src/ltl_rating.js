const Joi = require("joi");
const { get } = require("lodash");
const { v4 } = require("uuid");
const xml2js = require("xml2js");
const axios = require("axios");
const moment = require("moment");
const qs = require("qs");
const { zips } = require("../../src/shared/ltlRater/zipCode.js");
const AWS = require("aws-sdk");
const dynamoDB = new AWS.DynamoDB.DocumentClient();

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
            [
                "FWDA",
                "EXLA",
                "FEXF",
                "ODFL",
                "ABFS",
                "AVRT",
                "DAFG",
                "SEFN",
                "PENS",
                "SAIA",
                "XPOL",
            ].map(async (carrier) => {
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
                if (carrier === "ODFL") {
                    return await processODFLRequest({
                        pickupTime,
                        insuredValue,
                        shipperZip,
                        consigneeZip,
                        shipmentLines,
                        accessorialList,
                        reference,
                    });
                }
                if (carrier === "ABFS") {
                    return await processABFSRequest({
                        pickupTime,
                        insuredValue,
                        shipperZip,
                        consigneeZip,
                        shipmentLines,
                        accessorialList,
                    });
                }
                if (carrier === "AVRT") {
                    return await processAVRTRequest({
                        pickupTime,
                        insuredValue,
                        shipperZip,
                        consigneeZip,
                        shipmentLines,
                        accessorialList,
                    });
                }
                if (carrier === "DAFG") {
                    return await processDAFGRequest({
                        pickupTime,
                        insuredValue,
                        shipperZip,
                        consigneeZip,
                        shipmentLines,
                        accessorialList,
                    });
                }
                if (carrier === "SEFN") {
                    return await processSEFNRequest({
                        pickupTime,
                        insuredValue,
                        shipperZip,
                        consigneeZip,
                        shipmentLines,
                        accessorialList,
                    });
                }
                if (carrier === "PENS") {
                    return await processPENSRequest({
                        pickupTime,
                        insuredValue,
                        shipperZip,
                        consigneeZip,
                        shipmentLines,
                        accessorialList,
                    });
                }
                if (carrier === "SAIA") {
                    return await processSAIARequest({
                        pickupTime,
                        insuredValue,
                        shipperZip,
                        consigneeZip,
                        shipmentLines,
                        accessorialList,
                    });
                }
                if (carrier === "XPOL") {
                    return await processXPOLRequest({
                        pickupTime,
                        insuredValue,
                        shipperZip,
                        consigneeZip,
                        shipmentLines,
                        accessorialList,
                    });
                }
            })
        );
        console.log(
            `🙂 -> file: ltl_rating.js:127 -> apiResponse:`,
            apiResponse
        );
        const response = { ...responseBodyFormat };
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
    ABFS: {
        ID: "99YGF074",
        TPBAFF: "Y",
        TPBPay: "Y",
        TPBZip: "75019",
        ShipZip: "90210",
        ConsZip: "94132",
        DeclaredValue: "1000",
        Acc_ELC: "Y",
        DeclaredType: "N",
        ShipMonth: "10",
        ShipDay: "01",
        ShipYear: "2023",
        FrtHght1: "30",
        FrtLng1: "20",
        FrtWdth1: "20",
        FrtLWHType: "IN",
        UnitNo1: "3",
        UnitType1: "PC",
        Class1: "70",
        Wgt1: "225",
        Acc_HAZ: "Y",
        Acc_IPU: "Y",
        Acc_RPU: "Y",
        Acc_GRD_PU: "Y",
        Acc_IDEL: "Y",
        Acc_RDEL: "Y",
        Acc_GRD_DEL: "Y",
    },
    AVRT: {
        accountNumber: "",
        customerType: "",
        paymentType: "",
        originZip: "",
        originCity: "",
        originState: "",
        destinationZip: "",
        destinationCity: "",
        destinationState: "",
        additionalCargoLiability: "",
        shipDate: "",
        numPieces: "",
        cubicFeet: "",
        shipmentInfo: {
            items: [],
            accessorials: {},
        },
    },
    DAFG: {
        accessorials: [],
        account: "",
        destination: "",
        handlingUnits: [],
        items: [],
        origin: "",
        shipmentDate: "",
        terms: "",
    },
    SEFN: {
        Username: "",
        Password: "",
        CustomerAccount: "",
        returnX: "",
        rateXML: "",
        Option: "",
        PickupDateMM: "",
        PickupDateDD: "",
        PickupDateYYYY: "",
        Terms: "",
        OriginZip: "",
        OrigCountry: "",
        DestinationZip: "",
        DestCountry: "",
        NumberOfUnits1: "",
        Weight1: "",
        DimsOption: "",
        PieceLength1: "",
        PieceWidth1: "",
        PieceHeight1: "",
        UnitOfMeasure1: "",
        chkHM: "",
        Class1: "",
        chkIP: "",
        chkPR: "",
        chkLGP: "",
        chkID: "",
        chkPR: "",
        chkLGD: "",
    },
    PENS: {
        "soap12:Envelope": {
            $: {
                "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
                "xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
                "xmlns:soap12": "http://www.w3.org/2003/05/soap-envelope",
            },
            "soap12:Body": {
                CreatePensRateQuote: {
                    $: { xmlns: "http://peninsulatruck.com/WebServices" },
                    userId: "",
                    password: "",
                    account: "",
                    customerType: "",
                    nonePalletizedMode: "",
                    originZip: "",
                    destinationZip: "",
                    classList: "",
                    weightList: "",
                    pltCountList: "",
                    pltLengthList: "",
                    pltWidthList: "",
                    accessorialList: [],
                },
            },
        },
    },
    SAIA: {
        "soap:Envelope": {
            $: {
                "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
                "xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
                "xmlns:soap": "http://schemas.xmlsoap.org/soap/envelope/",
            },
            "soap:Body": {
                Create: {
                    $: {
                        xmlns: "http://www.saiasecure.com/WebService/ratequote/",
                    },
                    request: {
                        Details: {
                            DetailItem: {
                                Weight: "",
                                Class: "",
                            },
                        },
                        Dimensions: {
                            DimensionItem: {
                                Length: "",
                                Width: "",
                                Height: "",
                                Units: "",
                            },
                        },
                        Accessorials: {
                            AccessorialItem: { Code: [] },
                        },
                        UserID: "",
                        Password: "",
                        TestMode: "",
                        BillingTerms: "",
                        AccountNumber: "",
                        Application: "",
                        OriginZipcode: "",
                        DestinationCity: "",
                        DestinationState: "",
                        DestinationZipcode: "",
                        FullValueCoverage: "",
                    },
                },
            },
        },
    },
    XPOL: {
        shipmentInfo: {
            shipmentDate: "",
            shipper: {
                address: {
                    postalCd: "",
                },
            },
            consignee: {
                address: {
                    postalCd: "",
                },
            },
            commodity: [,],
            accessorials: [],
            paymentTermCd: "",
            bill2Party: {
                acctInstId: "",
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
    let parser = new xml2js.Parser({ trim: true });
    const parsed = await parser.parseStringPromise(response);
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
        ]["rat1:accessorials"]["rat1:accessorialCode"].push(
            accessorialMappingEXLA[accessorial]
        );
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
                units: dimUOM,
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
            id: index + 1,
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
    ]["specialServiceTypes"] = accessorialList
        .filter((acc) => Object.keys(accessorialMappingFEXF).includes(acc))
        .map((item) => accessorialMappingFEXF[item]);
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
                transitDays: transitDaysMappingFEXF[transitDays],
                quoteNumber,
                totalRate,
                accessorialList,
            };
            if (rateType.toUpperCase() === "ACCOUNT")
                return responseBodyFormat["ltlRateResponse"].push(data);
        });
    });
}

async function processODFLRequest({
    pickupTime,
    insuredValue,
    shipperZip,
    consigneeZip,
    shipmentLines,
    accessorialList,
    reference,
}) {
    const payload = getXmlPayloadODFL({
        pickupTime,
        insuredValue,
        shipperZip,
        consigneeZip,
        shipmentLines,
        accessorialList,
        reference,
    });
    console.log(`🙂 -> file: ltl_rating.js:955 -> payload:`, payload);
    let headers = {
        "Content-Type": "application/xml",
    };
    let url = "https://www.odfl.com/wsRate_v6/RateService";
    const response = await axiosRequest(url, payload, headers);
    console.log(`🙂 -> file: ltl_rating.js:961 -> response:`, response);
    if (!response) return false;
    await processODFLResponses({ response });
    return { response };
}

function getXmlPayloadODFL({
    pickupTime,
    insuredValue,
    shipperZip,
    consigneeZip,
    shipmentLines,
    accessorialList,
    reference,
}) {
    xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"][
        "myr:getLTLRateEstimate"
    ]["arg0"]["odfl4MeUser"] = "OmniDFW";
    xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"][
        "myr:getLTLRateEstimate"
    ]["arg0"]["odfl4MePassword"] = "Omnidfw1!";
    xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"][
        "myr:getLTLRateEstimate"
    ]["arg0"]["odflCustomerAccount"] = "13469717";
    xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"][
        "myr:getLTLRateEstimate"
    ]["arg0"]["shipType"] = "LTL";
    xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"][
        "myr:getLTLRateEstimate"
    ]["arg0"]["tariff"] = "559";
    xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"][
        "myr:getLTLRateEstimate"
    ]["arg0"]["requestReferenceNumber"] = 1;
    xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"][
        "myr:getLTLRateEstimate"
    ]["arg0"]["originPostalCode"] = shipperZip;
    xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"][
        "myr:getLTLRateEstimate"
    ]["arg0"]["destinationPostalCode"] = consigneeZip;
    xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"][
        "myr:getLTLRateEstimate"
    ]["arg0"]["pickupDateTime"] = pickupTime;
    xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"][
        "myr:getLTLRateEstimate"
    ]["arg0"]["insuranceAmount"] = insuredValue;
    xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"][
        "myr:getLTLRateEstimate"
    ]["arg0"]["accessorials"] = accessorialList
        .filter((acc) => Object.keys(accessorialMappingODFL).includes(acc))
        .map((item) => accessorialMappingODFL[item]);
    const shipmentLine = shipmentLines[0];
    xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"][
        "myr:getLTLRateEstimate"
    ]["arg0"]["freightItems"] = {
        height: get(shipmentLine, "height"),
        width: get(shipmentLine, "width"),
        length: get(shipmentLine, "length"),
        numberOfUnits: get(shipmentLine, "pieces"),
        ratedClass: get(shipmentLine, "freightClass"),
        weight: get(shipmentLine, "weight"),
    };
    if (
        get(shipmentLine, "hazmat") === true ||
        get(shipmentLine, "hazmat") === "true"
    ) {
        xmlPayloadFormat["ODFL"]["soapenv:Envelope"]["soapenv:Body"][
            "myr:getLTLRateEstimate"
        ]["arg0"]["accessorials"].push("HAZ");
    }

    const builder = new xml2js.Builder({
        headless: true,
    });
    return builder.buildObject(xmlPayloadFormat.ODFL);
}

async function processODFLResponses({ response }) {
    let parser = new xml2js.Parser({ trim: true });
    const parsed = await parser.parseStringPromise(response);
    const Body = get(parsed, "soapenv:Envelope.soapenv:Body[0]");
    const getLTLRateEstimateResponse = get(
        Body,
        "ns2:getLTLRateEstimateResponse[0]"
    );
    const returnObj = get(getLTLRateEstimateResponse, "return[0]");
    const success = get(returnObj, "success[0]");
    const transitDays = get(returnObj, "destinationCities[0].serviceDays[0]");
    const quoteNumber = get(returnObj, "referenceNumber[0]");
    const rateEstimate = get(returnObj, "rateEstimate[0]");
    const totalRate = get(rateEstimate, "netFreightCharge[0]");
    const accessorialList = get(rateEstimate, "accessorialCharges", []).map(
        (acc) => ({
            code: "",
            description: get(acc, "description[0]"),
            charge: get(acc, "amount[0]"),
        })
    );
    const data = {
        carrier: "ODFL",
        transitDays: transitDays,
        quoteNumber,
        totalRate,
        accessorialList,
    };
    if (success === true || success === "true") {
        responseBodyFormat["ltlRateResponse"].push(data);
    }
}

async function processABFSRequest({
    pickupTime,
    insuredValue,
    shipperZip,
    consigneeZip,
    shipmentLines,
    accessorialList,
}) {
    const payload = getXmlPayloadABFS({
        pickupTime,
        insuredValue,
        shipperZip,
        consigneeZip,
        shipmentLines,
        accessorialList,
    });
    console.log(`🙂 -> file: ltl_rating.js:955 -> payload:`, payload);
    let headers = {};
    const baseUrl = "https://www.abfs.com/xml/aquotexml.asp";
    const queryString = qs.stringify(payload);
    const url = `${baseUrl}?${queryString}`;
    console.log(`🙂 -> file: ltl_rating.js:1163 -> url:`, url);
    const response = await axiosRequest(url, payload, headers, "get");
    console.log(`🙂 -> file: ltl_rating.js:1164 -> response:`, response);
    if (!response) return false;
    await processABFSResponses({ response });
    return { response };
}

function getXmlPayloadABFS({
    pickupTime,
    insuredValue,
    shipperZip,
    consigneeZip,
    shipmentLines,
    accessorialList,
}) {
    xmlPayloadFormat["ABFS"]["ID"] = "99YGF074";
    xmlPayloadFormat["ABFS"]["TPBAFF"] = "Y";
    xmlPayloadFormat["ABFS"]["TPBPay"] = "Y";
    xmlPayloadFormat["ABFS"]["TPBZip"] = "75019";
    xmlPayloadFormat["ABFS"]["ShipZip"] = shipperZip;
    xmlPayloadFormat["ABFS"]["ConsZip"] = consigneeZip;
    xmlPayloadFormat["ABFS"]["DeclaredValue"] = insuredValue;
    xmlPayloadFormat["ABFS"]["Acc_ELC"] = "Y";
    xmlPayloadFormat["ABFS"]["DeclaredType"] = "N";
    xmlPayloadFormat["ABFS"]["ShipMonth"] = moment(new Date(pickupTime)).get(
        "month"
    );
    xmlPayloadFormat["ABFS"]["ShipDay"] = moment(new Date(pickupTime)).get(
        "date"
    );
    xmlPayloadFormat["ABFS"]["ShipYear"] = moment(new Date(pickupTime)).get(
        "year"
    );
    const shipmentLine = shipmentLines[0];
    const length = get(shipmentLine, "length");
    const width = get(shipmentLine, "width");
    const height = get(shipmentLine, "height");
    const dimUOM = unitMapping["ABFS"][get(shipmentLine, "dimUOM")];
    const hazmat = get(shipmentLine, "hazmat", false);
    const freightClass = get(shipmentLine, "freightClass");
    const pieces = get(shipmentLine, "pieces");
    const pieceType = pieceTypeMappingABFS[get(shipmentLine, "pieceType")];
    const weight = get(shipmentLine, "weight");
    xmlPayloadFormat["ABFS"]["FrtHght1"] = height;
    xmlPayloadFormat["ABFS"]["FrtLng1"] = length;
    xmlPayloadFormat["ABFS"]["FrtWdth1"] = width;
    xmlPayloadFormat["ABFS"]["FrtLWHType"] = dimUOM;
    xmlPayloadFormat["ABFS"]["UnitNo1"] = pieces;
    xmlPayloadFormat["ABFS"]["UnitType1"] = pieceType;
    xmlPayloadFormat["ABFS"]["Class1"] = freightClass;
    xmlPayloadFormat["ABFS"]["Wgt1"] = weight;
    xmlPayloadFormat["ABFS"]["Acc_HAZ"] = hazmat ? "Y" : "N";
    setAccessorialForABFS(accessorialList);
    return xmlPayloadFormat["ABFS"];
}

function setAccessorialForABFS(accessorialList) {
    accessorialList.map((item) => {
        if (item === "INSPU") {
            xmlPayloadFormat["ABFS"]["Acc_IPU"] = "Y";
        } else xmlPayloadFormat["ABFS"]["Acc_IPU"] = "N";
        if (item === "RESID") {
            xmlPayloadFormat["ABFS"]["Acc_RPU"] = "Y";
        } else xmlPayloadFormat["ABFS"]["Acc_RPU"] = "N";
        if (item === "LIFT") {
            xmlPayloadFormat["ABFS"]["Acc_GRD_PU"] = "Y";
        } else xmlPayloadFormat["ABFS"]["Acc_GRD_PU"] = "N";
        if (item === "INDEL") {
            xmlPayloadFormat["ABFS"]["Acc_IDEL"] = "Y";
        } else xmlPayloadFormat["ABFS"]["Acc_IDEL"] = "N";
        if (item === "RESDE") {
            xmlPayloadFormat["ABFS"]["Acc_RDEL"] = "Y";
        } else xmlPayloadFormat["ABFS"]["Acc_RDEL"] = "N";
        if (item === "LIFTD") {
            xmlPayloadFormat["ABFS"]["Acc_GRD_DEL"] = "Y";
        } else xmlPayloadFormat["ABFS"]["Acc_GRD_DEL"] = "N";
    });
}

async function processABFSResponses({ response }) {
    let parser = new xml2js.Parser({ trim: true });
    const parsed = await parser.parseStringPromise(response);
    const afb = get(parsed, "ABF", {});
    const isError = Object.keys(afb).includes("ERROR");
    const quoteNumber = get(afb, "QUOTEID[0]");
    const totalRate = get(afb, "CHARGE[0]");
    const transitDays = parseInt(get(afb, "ADVERTISEDTRANSIT[0]", 0), 10);
    const data = {
        carrier: "ABFS",
        transitDays,
        quoteNumber,
        totalRate,
    };
    if (!isError) {
        responseBodyFormat["ltlRateResponse"].push(data);
    }
}

async function processAVRTRequest({
    pickupTime,
    insuredValue,
    shipperZip,
    consigneeZip,
    shipmentLines,
    accessorialList,
}) {
    const payload = getXmlPayloadAVRT({
        pickupTime,
        insuredValue,
        shipperZip,
        consigneeZip,
        shipmentLines,
        accessorialList,
    });
    console.log(`🙂 -> file: ltl_rating.js:955 -> payload:`, payload);
    let headers = {};
    const url = `https://api.averittexpress.com/rate-quotes/ltl?api_key=f6723fe521a149c0871694379cf0c047`;
    console.log(`🙂 -> file: ltl_rating.js:1163 -> url:`, url);
    const response = await axiosRequest(url, payload, headers);
    console.log(`🙂 -> file: ltl_rating.js:1164 -> response:`, response);
    if (!response) return false;
    processAVRTResponses({ response });
    return { response };
}

function getXmlPayloadAVRT({
    pickupTime,
    insuredValue,
    shipperZip,
    consigneeZip,
    shipmentLines,
    accessorialList,
}) {
    const shipperDetails = zips[shipperZip];
    const destinationDetails = zips[consigneeZip];
    xmlPayloadFormat["AVRT"]["accountNumber"] = "0834627";
    xmlPayloadFormat["AVRT"]["customerType"] = "Third Party";
    xmlPayloadFormat["AVRT"]["paymentType"] = "Prepaid";
    xmlPayloadFormat["AVRT"]["originZip"] =
        get(shipperDetails, "zip_code") + "";
    xmlPayloadFormat["AVRT"]["originCity"] = get(shipperDetails, "city");
    xmlPayloadFormat["AVRT"]["originState"] = get(shipperDetails, "state");
    xmlPayloadFormat["AVRT"]["destinationZip"] =
        get(destinationDetails, "zip_code") + "";
    xmlPayloadFormat["AVRT"]["destinationCity"] = get(
        destinationDetails,
        "city"
    );
    xmlPayloadFormat["AVRT"]["destinationState"] = get(
        destinationDetails,
        "state"
    );
    xmlPayloadFormat["AVRT"]["additionalCargoLiability"] = insuredValue;
    xmlPayloadFormat["AVRT"]["shipDate"] = pickupTime.split("T")[0];
    const shipmentLine = shipmentLines[0];
    const length = get(shipmentLine, "length");
    const width = get(shipmentLine, "width");
    const height = get(shipmentLine, "height");
    const cubicFeet = (length * width * height) / Math.pow(12, 3);
    xmlPayloadFormat["AVRT"]["numPieces"] = get(shipmentLine, "pieces");
    xmlPayloadFormat["AVRT"]["cubicFeet"] = cubicFeet;
    xmlPayloadFormat["AVRT"]["shipmentInfo"]["items"].push({
        shipmentClass: get(shipmentLine, "freightClass"),
        shipmentWeight: get(shipmentLine, "weight"),
    });
    if (get(shipmentLine, "hazmat"))
        xmlPayloadFormat["AVRT"]["shipmentInfo"]["accessorials"][
            "hazmat"
        ] = true;
    accessorialList.forEach((acc) => {
        if (["LIFT", "LIFTD"].includes(acc))
            xmlPayloadFormat["AVRT"]["shipmentInfo"]["accessorials"][
                "liftgate"
            ] = true;
        if (acc === "INDEL")
            xmlPayloadFormat["AVRT"]["shipmentInfo"]["accessorials"][
                "insideDelivery"
            ] = true;
        if (acc === "RESDE")
            xmlPayloadFormat["AVRT"]["shipmentInfo"]["accessorials"][
                "residentialDelivery"
            ] = true;
    });

    return xmlPayloadFormat["AVRT"];
}

function processAVRTResponses({ response }) {
    const quoteDetails = get(response, "quoteDetails");
    const quoteNumber = get(quoteDetails, "rateQuoteNumber");
    const serviceLevelDescription = get(quoteDetails, "deliveryOption");
    const totalRate = get(quoteDetails, "totalCharge");
    const transitDays = get(quoteDetails, "estimatedServiceDays");
    const accessorialList = get(response, "accessorialCharges", []).map(
        (acc) => ({
            description: get(acc, "description"),
            charge: get(acc, "value"),
        })
    );
    const data = {
        serviceLevelDescription,
        carrier: "AVRT",
        transitDays,
        quoteNumber,
        totalRate,
        accessorialList,
    };
    responseBodyFormat["ltlRateResponse"].push(data);
}

async function processDAFGRequest({
    pickupTime,
    insuredValue,
    shipperZip,
    consigneeZip,
    shipmentLines,
    accessorialList,
}) {
    const payload = getXmlPayloadDAFG({
        pickupTime,
        insuredValue,
        shipperZip,
        consigneeZip,
        shipmentLines,
        accessorialList,
    });
    let headers = {
        Authorization: "Basic TUFDSDE6TWFjaDFMVEw=",
        "Content-Type": "application/json",
    };
    const url = `https://api.daytonfreight.com/api/Rates`;
    const response = await axiosRequest(url, JSON.stringify(payload), headers);
    if (!response) return false;
    processDAFGResponses({ response });
    return { response };
}

function getXmlPayloadDAFG({
    pickupTime,
    insuredValue,
    shipperZip,
    consigneeZip,
    shipmentLines,
    accessorialList,
}) {
    xmlPayloadFormat["DAFG"]["account"] = "AE11312";
    xmlPayloadFormat["DAFG"]["destination"] = consigneeZip;
    xmlPayloadFormat["DAFG"]["origin"] = shipperZip;
    xmlPayloadFormat["DAFG"]["shipmentDate"] = pickupTime;
    xmlPayloadFormat["DAFG"]["terms"] = "ThirdPartyPrepaid";
    const shipmentLine = shipmentLines[0];
    const height = get(shipmentLine, "height");
    const length = get(shipmentLine, "length");
    const width = get(shipmentLine, "width");
    const weight = get(shipmentLine, "weight");
    const hazmat = get(shipmentLine, "hazmat", false);
    const pieces = get(shipmentLine, "pieces");
    const freightClass = get(shipmentLine, "freightClass");

    xmlPayloadFormat["DAFG"]["handlingUnits"].push({
        height,
        length,
        quantity: pieces,
        width,
        stackable: false,
    });

    xmlPayloadFormat["DAFG"]["items"].push({
        class: freightClass,
        weight,
    });
    xmlPayloadFormat["DAFG"]["accessorials"] = accessorialList
        .filter((acc) => Object.keys(accessorialMappingDAFG).includes(acc))
        .map((item) => accessorialMappingDAFG[item]);
    if (hazmat) xmlPayloadFormat["DAFG"]["accessorials"].push("HMF");
    return xmlPayloadFormat["DAFG"];
}

function processDAFGResponses({ response }) {
    const quoteNumber = get(response, "id");
    const totalRate = get(response, "total");
    const transitDays = get(response, "serviceEligibility.serviceDays");
    const accessorialList = get(response, "accessorials", []).map((acc) => ({
        code: get(acc, "code"),
        description: get(acc, "name"),
        charge: get(acc, "amount"),
    }));
    const data = {
        serviceLevel: "",
        serviceLevelDescription: "",
        carrier: "DAFG",
        transitDays,
        quoteNumber,
        totalRate,
        accessorialList,
    };
    console.log(`🙂 -> file: index.js:324 -> data:`, data);
    responseBodyFormat["ltlRateResponse"].push(data);
}

async function processSEFNRequest({
    pickupTime,
    insuredValue,
    shipperZip,
    consigneeZip,
    shipmentLines,
    accessorialList,
}) {
    const payload = getXmlPayloadSEFN({
        pickupTime,
        insuredValue,
        shipperZip,
        consigneeZip,
        shipmentLines,
        accessorialList,
    });
    console.log(`🙂 -> file: index.js:350 -> payload:`, payload);
    let headers = {};
    const baseUrl = `https://www.sefl.com/webconnect/ratequotes`;
    const query = qs.stringify(payload);
    const url = `${baseUrl}?${query}`;
    const response = await axiosRequest(url, undefined, headers, "get");
    console.log(`🙂 -> file: ltl_rating.js:1571 -> url:`, url);
    if (!response) return false;
    await processSEFNResponses({ response });
    return { response };
}

function getXmlPayloadSEFN({
    pickupTime,
    insuredValue,
    shipperZip,
    consigneeZip,
    shipmentLines,
    accessorialList,
}) {
    xmlPayloadFormat["SEFN"]["Username"] = "OMNILOG";
    xmlPayloadFormat["SEFN"]["Password"] = "OMN474";
    xmlPayloadFormat["SEFN"]["CustomerAccount"] = 999840398;
    xmlPayloadFormat["SEFN"]["returnX"] = "Y";
    xmlPayloadFormat["SEFN"]["rateXML"] = "Y";
    xmlPayloadFormat["SEFN"]["Option"] = "T";
    xmlPayloadFormat["SEFN"]["PickupDateMM"] =
        moment(new Date(pickupTime)).get("month") + 1;
    xmlPayloadFormat["SEFN"]["PickupDateDD"] = moment(new Date(pickupTime)).get(
        "date"
    );
    xmlPayloadFormat["SEFN"]["PickupDateYYYY"] = moment(
        new Date(pickupTime)
    ).get("year");
    xmlPayloadFormat["SEFN"]["Terms"] = "P";
    xmlPayloadFormat["SEFN"]["OriginZip"] = shipperZip;
    xmlPayloadFormat["SEFN"]["OrigCountry"] = "U";
    xmlPayloadFormat["SEFN"]["DestinationZip"] = consigneeZip;
    xmlPayloadFormat["SEFN"]["DestCountry"] = "U";
    xmlPayloadFormat["SEFN"]["DestCountry"] = "U";
    const shipmentLine = shipmentLines[0];
    const height = get(shipmentLine, "height");
    const length = get(shipmentLine, "length");
    const width = get(shipmentLine, "width");
    const weight = get(shipmentLine, "weight");
    const hazmat = get(shipmentLine, "hazmat", false);
    const pieces = get(shipmentLine, "pieces");
    const freightClass = get(shipmentLine, "freightClass");
    const dimUOM = unitMapping["SEFN"][get(shipmentLine, "dimUOM")];
    xmlPayloadFormat["SEFN"]["NumberOfUnits1"] = pieces;
    xmlPayloadFormat["SEFN"]["Weight1"] = weight;
    xmlPayloadFormat["SEFN"]["DimsOption"] = "I";
    xmlPayloadFormat["SEFN"]["PieceLength1"] = length;
    xmlPayloadFormat["SEFN"]["PieceWidth1"] = width;
    xmlPayloadFormat["SEFN"]["PieceHeight1"] = height;
    xmlPayloadFormat["SEFN"]["UnitOfMeasure1"] = dimUOM;
    xmlPayloadFormat["SEFN"]["UnitOfMeasure1"] = dimUOM;
    if (hazmat) xmlPayloadFormat["SEFN"]["chkHM"] = "on";
    xmlPayloadFormat["SEFN"]["Class1"] = freightClass;

    accessorialList
        .filter((acc) => Object.keys(accessorialMappingSEFN).includes(acc))
        .map((item) => {
            if (item === "INSPU") xmlPayloadFormat["SEFN"]["chkIP"] = "on";
            if (item === "RESID") xmlPayloadFormat["SEFN"]["chkPR"] = "on";
            if (item === "LIFT") xmlPayloadFormat["SEFN"]["chkLGP"] = "on";
            if (item === "INDEL") xmlPayloadFormat["SEFN"]["chkID"] = "on";
            if (item === "RESDE") xmlPayloadFormat["SEFN"]["chkPR"] = "on";
            if (item === "LIFTD") xmlPayloadFormat["SEFN"]["chkLGD"] = "on";
        });

    return xmlPayloadFormat["SEFN"];
}

async function processSEFNResponses({ response }) {
    let parser = new xml2js.Parser({ trim: true });
    const parsed = await parser.parseStringPromise(response);
    const dataRoot = get(parsed, "root");
    const error = get(dataRoot, "error[0]") !== "";
    const quoteNumber = get(dataRoot, "quoteId[0]");
    const totalRate = get(dataRoot, "rateQuote[0]");
    const transitDays = get(dataRoot, "transitTime[0]");
    const details = get(dataRoot, "details[0]");
    const typeCharge = get(details, "typeCharge", []);
    const descArray = get(details, "description", []);
    const chargeArray = get(details, "charges", []);
    const accessorialList = [];
    for (let index = 0; index < typeCharge.length; index++) {
        const code = typeCharge[index] ?? "";
        const description = descArray[index] ?? "";
        const charge = chargeArray[index] ?? "";
        accessorialList.push({ code, description, charge });
    }
    const data = {
        carrier: "SEFN",
        serviceLevel: "",
        serviceLevelDescription: "",
        quoteNumber,
        transitDays,
        totalRate,
        accessorialList,
    };
    if (error) return false;
    responseBodyFormat["ltlRateResponse"].push(data);
}

async function processPENSRequest({
    pickupTime,
    insuredValue,
    shipperZip,
    consigneeZip,
    shipmentLines,
    accessorialList,
}) {
    const payload = getXmlPayloadPENS({
        pickupTime,
        insuredValue,
        shipperZip,
        consigneeZip,
        shipmentLines,
        accessorialList,
    });
    console.log(`🙂 -> file: index.js:350 -> payload:`, payload);
    let headers = { "Content-Type": "application/soap+xml; charset=utf-8" };
    const url =
        "https://classicapi.peninsulatruck.com/webservices/pensrater.asmx";
    const response = await axiosRequest(url, payload, headers);
    console.log(`🙂 -> file: index.js:356 -> response:`, response);
    if (!response) return false;
    await processPENSResponses({ response });
    return { response };
}

function getXmlPayloadPENS({
    pickupTime,
    insuredValue,
    shipperZip,
    consigneeZip,
    shipmentLines,
    accessorialList,
}) {
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"][
        "CreatePensRateQuote"
    ]["userId"] = "OMNI";
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"][
        "CreatePensRateQuote"
    ]["password"] = "OMNI123";
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"][
        "CreatePensRateQuote"
    ]["account"] = "820504";
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"][
        "CreatePensRateQuote"
    ]["customerType"] = "B";
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"][
        "CreatePensRateQuote"
    ]["nonePalletizedMode"] = "";
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"][
        "CreatePensRateQuote"
    ]["originZip"] = shipperZip;
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"][
        "CreatePensRateQuote"
    ]["destinationZip"] = consigneeZip;
    const shipmentLine = shipmentLines[0];
    const length = get(shipmentLine, "length");
    const width = get(shipmentLine, "width");
    const weight = get(shipmentLine, "weight");
    const hazmat = get(shipmentLine, "hazmat", false);
    const pieces = get(shipmentLine, "pieces");
    const freightClass = get(shipmentLine, "freightClass");
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"][
        "CreatePensRateQuote"
    ]["classList"] = freightClass;
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"][
        "CreatePensRateQuote"
    ]["weightList"] = weight;
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"][
        "CreatePensRateQuote"
    ]["pltCountList"] = pieces;
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"][
        "CreatePensRateQuote"
    ]["pltLengthList"] = length;
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"][
        "CreatePensRateQuote"
    ]["pltWidthList"] = width;
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"][
        "CreatePensRateQuote"
    ]["accessorialList"] = accessorialList
        .filter((acc) => Object.keys(accessorialMappingPENS).includes(acc))
        .map((item) => accessorialMappingPENS[item]);
    if (hazmat)
        xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"][
            "CreatePensRateQuote"
        ]["accessorialList"].push("SP1HA");
    xmlPayloadFormat["PENS"]["soap12:Envelope"]["soap12:Body"][
        "CreatePensRateQuote"
    ]["accessorialList"].push(`FV${insuredValue}`);
    const builder = new xml2js.Builder({
        xmldec: { version: "1.0", encoding: "UTF-8" },
    });
    return builder.buildObject(xmlPayloadFormat["PENS"]);
}

async function processPENSResponses({ response }) {
    let parser = new xml2js.Parser({ trim: true });
    const parsed = await parser.parseStringPromise(response);
    const CreatePensRateQuoteResponse = get(
        parsed,
        "soap:Envelope.soap:Body[0].CreatePensRateQuoteResponse[0].CreatePensRateQuoteResult[0]"
    );
    const error = get(CreatePensRateQuoteResponse, "errors[0]", false);
    const quote = get(CreatePensRateQuoteResponse, "quote[0]");
    const quoteNumber = get(quote, "quoteNumber[0]");
    const totalRate = parseFloat(
        get(quote, "totalCharge[0]", "0").replace(/\D/g, "")
    ).toFixed(2);
    const transitDays = get(
        transitDaysMappingPENS,
        get(quote, "transitType[0]", "").replace(/[^a-zA-Z]/g, ""),
        "##"
    );
    const message = get(quote, "quoteRemark.remarkItem", "");
    const accessorialDetail = get(
        quote,
        "accessorialDetail[0].AccessorialItem",
        []
    );
    const accessorialList = accessorialDetail.map((acc) => ({
        code: get(acc, "code[0]"),
        description: get(acc, "description[0]"),
        charge: parseFloat(get(acc, "charge[0]")).toFixed(2),
    }));
    const data = {
        carrier: "PENS",
        serviceLevel: "",
        serviceLevelDescription: "",
        quoteNumber,
        transitDays,
        totalRate,
        message,
        accessorialList,
    };
    if (!error) responseBodyFormat["ltlRateResponse"].push(data);
}

async function processSAIARequest({
    pickupTime,
    insuredValue,
    shipperZip,
    consigneeZip,
    shipmentLines,
    accessorialList,
}) {
    const payload = getXmlPayloadSAIA({
        pickupTime,
        insuredValue,
        shipperZip,
        consigneeZip,
        shipmentLines,
        accessorialList,
    });
    console.log(`🙂 -> file: index.js:482 -> payload:`, payload);
    let headers = { "Content-Type": "text/xml; charset=utf-8" };
    const url = "http://wwwext.saiasecure.com/webservice/ratequote/soap.asmx";
    const response = await axiosRequest(url, payload, headers);
    if (!response) return false;
    await processSAIAResponses({ response });
    return { response };
}

function getXmlPayloadSAIA({
    pickupTime,
    insuredValue,
    shipperZip,
    consigneeZip,
    shipmentLines,
    accessorialList,
}) {
    const destination = zips[consigneeZip];
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"][
        "UserID"
    ] = "callcenter";
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"][
        "Password"
    ] = "omni921";
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"][
        "TestMode"
    ] = "N";
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"][
        "BillingTerms"
    ] = "Prepaid";
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"][
        "AccountNumber"
    ] = "0698518";
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"][
        "Application"
    ] = "ThirdParty";
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"][
        "OriginZipcode"
    ] = shipperZip;
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"][
        "DestinationCity"
    ] = get(destination, "city");
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"][
        "DestinationState"
    ] = get(destination, "state");
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"][
        "DestinationZipcode"
    ] = consigneeZip;
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"][
        "FullValueCoverage"
    ] = insuredValue;

    const shipmentLine = shipmentLines[0];
    const height = get(shipmentLine, "height");
    const length = get(shipmentLine, "length");
    const width = get(shipmentLine, "width");
    const weight = get(shipmentLine, "weight");
    const hazmat = get(shipmentLine, "hazmat", false);
    const pieces = get(shipmentLine, "pieces");
    const freightClass = get(shipmentLine, "freightClass");
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"][
        "Details"
    ]["DetailItem"] = {
        Weight: weight,
        Class: freightClass,
    };
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"][
        "Dimensions"
    ]["DimensionItem"] = {
        Height: height,
        Length: length,
        Units: pieces,
        Width: width,
    };
    xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"]["request"][
        "Accessorials"
    ]["AccessorialItem"]["Code"] = accessorialList
        .filter((acc) => Object.keys(accessorialMappingSAIA).includes(acc))
        .map((item) => accessorialMappingSAIA[item]);
    if (hazmat)
        xmlPayloadFormat["SAIA"]["soap:Envelope"]["soap:Body"]["Create"][
            "request"
        ]["Accessorials"]["AccessorialItem"]["Code"].push("Hazardous");
    const builder = new xml2js.Builder({
        xmldec: { version: "1.0", encoding: "UTF-8" },
    });
    return builder.buildObject(xmlPayloadFormat["SAIA"]);
}

async function processSAIAResponses({ response }) {
    let parser = new xml2js.Parser({ trim: true });
    const parsed = await parser.parseStringPromise(response);
    const body = get(
        parsed,
        "soap:Envelope.soap:Body[0].CreateResponse[0].CreateResult[0]"
    );
    const error = get(body, "Message[0]", "") !== "";
    const quoteNumber = get(body, "QuoteNumber[0]");
    const totalRate = parseFloat(
        get(body, "TotalInvoice[0]", "0").replace(/\D/g, "")
    ).toFixed(2);
    const transitDays = get(body, "StandardServiceDays[0]", "");
    console.log(`🙂 -> file: index.js:651 -> parsed:`, error);
    const accessorialList = get(
        body,
        "RateAccessorials[0].RateAccessorialItem",
        []
    ).map((acc) => ({
        code: get(acc, "Code[0]"),
        description: get(acc, "Description[0]"),
        charge: parseFloat(get(acc, "Amount[0]")).toFixed(2),
    }));
    const data = {
        carrier: "SAIA",
        serviceLevel: "",
        serviceLevelDescription: "",
        quoteNumber,
        transitDays,
        totalRate,
        accessorialList,
    };
    console.log(`🙂 -> file: index.js:685 -> data:`, data);
    if (!error) responseBodyFormat["ltlRateResponse"].push(data);
}

async function processXPOLRequest({
    pickupTime,
    insuredValue,
    shipperZip,
    consigneeZip,
    shipmentLines,
    accessorialList,
}) {
    const payload = getXmlPayloadXPOL({
        pickupTime,
        insuredValue,
        shipperZip,
        consigneeZip,
        shipmentLines,
        accessorialList,
    });
    console.log(`🙂 -> file: index.js:482 -> payload:`, payload);
    const token = await getTokenForXPOL();
    let headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
    };
    const url = "https://api.ltl.xpo.com/rating/1.0/ratequotes";
    const response = await axiosRequest(url, payload, headers);
    if (!response) return false;
    await processXPOLResponses({ response });
    return { response };
}

function getXmlPayloadXPOL({
    pickupTime,
    insuredValue,
    shipperZip,
    consigneeZip,
    shipmentLines,
    accessorialList,
}) {
    xmlPayloadFormat["XPOL"]["shipmentInfo"]["shipmentDate"] = pickupTime;
    xmlPayloadFormat["XPOL"]["shipmentInfo"]["shipper"]["address"]["postalCd"] =
        shipperZip;
    xmlPayloadFormat["XPOL"]["shipmentInfo"]["consignee"]["address"][
        "postalCd"
    ] = consigneeZip;
    xmlPayloadFormat["XPOL"]["shipmentInfo"]["paymentTermCd"] = "P";
    xmlPayloadFormat["XPOL"]["shipmentInfo"]["bill2Party"]["acctInstId"] =
        "70250271";

    xmlPayloadFormat["XPOL"]["shipmentInfo"]["commodity"] = shipmentLines.map(
        (shipmentLine) => {
            const height = get(shipmentLine, "height");
            const length = get(shipmentLine, "length");
            const width = get(shipmentLine, "width");
            const weight = get(shipmentLine, "weight");
            const hazmat = get(shipmentLine, "hazmat", false);
            const pieces = get(shipmentLine, "pieces");
            const weightUom = get(shipmentLine, "weightUOM");
            const dimUOM = get(shipmentLine, "dimUOM");
            const freightClass = get(shipmentLine, "freightClass");

            return {
                pieceCnt: pieces,
                grossWeight: {
                    weight: weight,
                    weightUom: get(unitMapping["XPOL"], weightUom, "lbs"),
                },
                dimensions: {
                    length: length,
                    width: width,
                    height: height,
                    dimensionsUom: get(unitMapping["XPOL"], dimUOM, "INCH"),
                },
                hazmatInd: hazmat,
                nmfcClass: freightClass,
            };
        }
    );
    const addedAcc = [];
    xmlPayloadFormat["XPOL"]["shipmentInfo"]["accessorials"] = [
        ...new Set(
            accessorialList
                .filter((acc) =>
                    Object.keys(accessorialMappingXPOL).includes(acc)
                )
                .map((item) => addedAcc.includes(accessorialMappingXPOL[item]))
        ),
    ].map((item2) => ({
        accessorialCd: accessorialMappingXPOL[item2],
    }));
    const hazmat0 = get(shipmentLines, "[0].hazmat", false);
    if (hazmat0)
        xmlPayloadFormat["XPOL"]["shipmentInfo"]["accessorials"].push({
            accessorialCd: "ZHM",
        });
    return xmlPayloadFormat["XPOL"];
}

async function processXPOLResponses({ response }) {
    const body = get(response, "data");
    const quoteNumber = get(body, "rateQuote.confirmationNbr");
    const totalRate = parseFloat(
        get(body, "rateQuote.totCharge[0].amt", "0")
    ).toFixed(2);
    const transitDays = get(body, "transitTime.transitDays", "");
    const accessorialList = get(
        body,
        "rateQuote.shipmentInfo.accessorials",
        []
    ).map((acc) => ({
        code: get(acc, "accessorialCd"),
        description: get(acc, "accessorialDesc"),
        charge: parseFloat(get(acc, "chargeAmt.amt")).toFixed(2),
    }));
    const data = {
        carrier: "XPOL",
        serviceLevel: "",
        serviceLevelDescription: "",
        quoteNumber,
        transitDays,
        totalRate,
        accessorialList,
    };
    console.log(`🙂 -> file: index.js:685 -> data:`, data);
    responseBodyFormat["ltlRateResponse"].push(data);
}

async function getTokenForXPOL() {
    const dynamoResponse = await getXPOLTokenFromDynamo();
    if (dynamoResponse) return dynamoResponse;
    const url = `https://api.ltl.xpo.com/token?grant_type=password&username=hmichel%40omnilogistics.com&password=OmniXpo22`;
    const headers = {
        Authorization:
            "Basic S01aaHZBWHNyUlFnUGs5QjI4SnEydG1tM3ljYTpJMWVSZkVSYWZMS2FoWmRTSWZJMUpGWnlraVFh",
        "Content-Type": "application/x-www-form-urlencoded",
    };
    let data = qs.stringify({
        access_token: "305ba928-4623-30bf-85f2-6f0657e63b03",
        refresh_token: "d2a22671-9dab-3660-8bca-3a148e302b15",
        scope: "default",
        token_type: "Bearer",
        expires_in: "36986",
    });
    const { access_token } = await axiosRequest(url, data, headers);
    await putXPOLTokenFromDynamo(access_token);
    return access_token;
}

async function getXPOLTokenFromDynamo() {
    const params = {
        TableName: "omni-dw-api-services-ltl-rating-logs-dev",
        Key: {
            pKey: "token",
            sKey: moment().format("DD-MM-YYYY"),
        },
    };
    try {
        let data = await dynamoDB.get(params).promise();
        console.info("QUERY RESP :", data);
        return get(data, "Item.token", false);
    } catch (err) {
        console.log(
            `🙂 -> file: ltl_rating.js:2071 -> params:`,
            params,
            "err",
            err
        );
        throw err;
    }
}

async function putXPOLTokenFromDynamo(token) {
    const currentDate = moment().format("DD-MM-YYYY");
    const params = {
        TableName: "omni-dw-api-services-ltl-rating-logs-dev",
        Key: {
            pKey: "token",
            sKey: currentDate,
            token: token,
            expiration: Math.floor(
                new Date(moment().add(11, "hours").format()).getTime() / 1000
            ),
        },
    };
    try {
        let data = await dynamoDB.put(params).promise();
        console.info("QUERY RESP :", data);
        return data;
    } catch (err) {
        console.log(
            `🙂 -> file: ltl_rating.js:2071 -> params:`,
            params,
            "err",
            err
        );
        throw err;
    }
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

const accessorialMappingODFL = {
    INSPU: "IPC",
    RESID: "RPC",
    LIFT: "HYO",
    APPTD: "CA",
    INDEL: "IDC",
    RESDE: "RDC",
    LIFTD: "HYD",
};

const unitMapping = {
    FWDA: {
        lb: "L",
    },
    FEXF: {
        lb: "LB",
        in: "IN",
    },
    ABFS: {
        lb: "LB",
        in: "IN",
    },
    SEFN: {
        in: "I",
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

const transitDaysMappingFEXF = {
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

const pieceTypeMappingABFS = {
    BND: "BDL",
    BOX: "BX",
    CRT: "CRT",
    CAS: "CS",
    CTN: "CTN",
    PCE: "PC",
    PLT: "PLT",
    REL: "REL",
    SKD: "SKD",
};

const accessorialMappingDAFG = {
    INSPU: "IPC",
    RESID: "RESIP",
    LIFT: "LIFTPU",
    APPTD: "NOT",
    INDEL: "IDC",
    RESDE: "RESID",
    LIFTD: "LIFTPU",
};

const accessorialMappingSEFN = {
    INSPU: "IPC",
    RESID: "RESIP",
    LIFT: "LIFTPU",
    APPTD: "NOT",
    INDEL: "IDC",
    RESDE: "RESID",
    LIFTD: "LIFTPU",
};

const transitDaysMappingPENS = {
    NextBusinessDay: 1,
    TwoBusinessDays: 2,
    ThreeBusinessDays: 3,
    FourBusinessDays: 4,
    FiveBusinessDays: 5,
    SixBusinessDays: 6,
    SevenBusinessDays: 7,
    EightBusinessDays: 8,
    NineBusinessDays: 9,
    TenBusinessDays: 10,
    ElevenBusinessDays: 11,
    TwelveBusinessDays: 12,
    ThirteenBusinessDays: 13,
    FourteenBusinessDays: 14,
    FifteenBusinessDays: 15,
    SixteenBusinessDays: 16,
    SeventeenBusinessDays: 17,
    EighteenBusinessDays: 18,
    NineteenBusinessDays: 19,
    TwentyBusinessDays: 20,
    TwentyOneBusinessDays: 21,
    TwentyTwoBusinessDays: 22,
    TwentyThreeBusinessDays: 23,
    TwentyFourBusinessDays: 24,
    TwentyFiveBusinessDays: 25,
    TwentySixBusinessDays: 26,
    TwentySevenBusinessDays: 27,
    TwentyEightBusinessDays: 28,
    TwentyNineBusinessDays: 29,
    ThirtyBusinessDays: 30,
};

const accessorialMappingPENS = {
    APPT: "AF1",
    INSPU: "IP1",
    RESID: "RP1",
    LIFT: "LP1",
    APPTD: "AF1",
    INDEL: "ID1",
    RESDE: "RD1",
    LIFTD: "SP1LD",
};

const accessorialMappingSAIA = {
    INSPU: "InsidePickup",
    RESID: "ResidentialPickup",
    LIFT: "LiftgateServicePU",
    APPTD: "ArrivalNotice/Appointment",
    INDEL: "InsideDelivery",
    RESDE: "ResidentialDelivery",
    LIFTD: "LiftgateService",
};

const accessorialMappingXPOL = {
    APPT: "TDC",
    INSPU: "OIP",
    RESID: "RSO",
    LIFT: "OLG",
    APPTD: "TDC",
    INDEL: "DID",
    RESDE: "RSD",
    LIFTD: "DLG",
};

async function axiosRequest(url, payload, header = {}, method = "POST") {
    try {
        let config = {
            method: method,
            maxBodyLength: Infinity,
            url,
            headers: { ...header },
            data: payload,
            timeout: 20000,
        };

        const res = await axios.request(config);
        if (res.status < 300) {
            return get(res, "data", {});
        } else {
            return false;
        }
    } catch (e) {
        console.log(`🙂 -> file: ltl_rating.js:361 -> e:`, e);
        return false;
    }
}
