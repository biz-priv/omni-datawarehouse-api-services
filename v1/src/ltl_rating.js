const { get, set, unset } = require("lodash");
const xml2js = require("xml2js");
const axios = require("axios");
const moment = require("moment");
const qs = require("qs");
const { ltlRateRequestSchema } = require("../../src/shared/validation/index.js");
const { xmlPayloadFormat, getXmlPayloadFWDA, getXmlPayloadEXLA, getXmlPayloadFEXF, getXmlPayloadODFL, getXmlPayloadABFS, getXmlPayloadAVRT, getXmlPayloadDAFG, getXmlPayloadSEFN, getXmlPayloadPENS, getXmlPayloadSAIA, getXmlPayloadXPOL, getXmlPayloadRDFS } = require("../../src/shared/ltlRater/payloadFormats.js");
const { transitDaysMappingPENS, sendMessageToQueue, getUnixTime, getNowTime, getTokenForFEXF } = require("../../src/shared/ltlRater/helper.js");
const AWS = require("aws-sdk");
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const { LTL_LOG_TABLE, FWDA_URL, FWDA_USER, FWDA_PASSWORD, FWDA_CUSTOMERID, EXLA_URL, FEXF_URL, ODFL_URL, ABFS_BASEURL, AVRT_URL, DAFG_URL, SEFN_BASEURL, PENS_URL, SAIA_URL, XPOL_URL, XPOL_TOKEN_URL, XPOL_AUTHORIZATION, XPOL_ACCESS_TOKEN, XPOL_REFRESH_TOKEN, XPOL_EXPIRES_IN, RDFS_URL, LOG_QUEUE } = process.env;

let payloadForQueue = [];

module.exports.handler = async (event) => {
    //NOSONAR
    const now = getNowTime();
    console.info(`🙂 -> file: ltl_rating.js:2 -> event:`, event);
    responseBodyFormat["ltlRateResponse"] = [];
    payloadForQueue = [];
    xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["FreightDetails"]["FreightDetail"] = [];
    xmlPayloadFormat["FWDA"]["FAQuoteRequest"]["Dimensions"]["Dimension"] = [];
    xmlPayloadFormat["EXLA"]["soapenv:Envelope"]["soapenv:Body"]["rat1:rateRequest"]["rat1:fullCommodities"]["rat1:commodity"] = [];
    xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["requestedPackageLineItems"] = [];
    xmlPayloadFormat["FEXF"]["freightRequestedShipment"]["freightShipmentDetail"]["lineItem"] = [];
    xmlPayloadFormat["AVRT"]["shipmentInfo"]["items"] = [];
    xmlPayloadFormat["DAFG"]["handlingUnits"] = [];
    xmlPayloadFormat["DAFG"]["items"] = [];
    xmlPayloadFormat["XPOL"]["shipmentInfo"]["commodity"] = [];
    unset(xmlPayloadFormat, "EXLA.soapenv:Envelope.soapenv:Body.rat1:rateRequest.rat1:accessorials");
    unset(xmlPayloadFormat, "FEXF.freightRequestedShipment.freightShipmentSpecialServices");
    unset(xmlPayloadFormat, "ODFL.soapenv:Envelope.soapenv:Body.myr:getLTLRateEstimate.arg0.accessorials");
    set(xmlPayloadFormat, "ABFS.Acc_IPU", "N");
    set(xmlPayloadFormat, "ABFS.Acc_RPU", "N");
    set(xmlPayloadFormat, "ABFS.Acc_GRD_PU", "N");
    set(xmlPayloadFormat, "ABFS.Acc_IDEL", "N");
    set(xmlPayloadFormat, "ABFS.Acc_RDEL", "N");
    set(xmlPayloadFormat, "ABFS.Acc_GRD_DEL", "N");
    set(xmlPayloadFormat, "ABFS.Acc_HAZ", "N");
    unset(xmlPayloadFormat, "AVRT.shipmentInfo.accessorials");
    unset(xmlPayloadFormat, "DAFG.accessorials");
    set(xmlPayloadFormat, "SEFN.chkIP", "off");
    set(xmlPayloadFormat, "SEFN.chkPR", "off");
    set(xmlPayloadFormat, "SEFN.chkLGP", "off");
    set(xmlPayloadFormat, "SEFN.chkID", "off");
    set(xmlPayloadFormat, "SEFN.chkLGD", "off");
    unset(xmlPayloadFormat, "SAIA.soap:Envelope.soap:Body.Create.request.Accessorials");
    unset(xmlPayloadFormat, "XPOL.shipmentInfo.accessorials");
    unset(xmlPayloadFormat, "RDFS.soap:Envelope.soap:Body.RateQuote.request.ServiceDeliveryOptions");
    const queueData = {};
    try {
        const validation = await ltlRateRequestSchema.validateAsync(get(event, "body"));
        console.info(`🙂 -> file: ltl_rating.js:32 -> validation:`, validation);
        const { error } = validation;
        if (error) throw error;
        const body = get(event, "body");
        const ltlRateRequest = get(body, "ltlRateRequest");
        const pickupTime = get(ltlRateRequest, "pickupTime");
        const insuredValue = get(ltlRateRequest, "insuredValue", 0);
        const shipperZip = get(ltlRateRequest, "shipperZip");
        const consigneeZip = get(ltlRateRequest, "consigneeZip");
        const shipmentLines = get(ltlRateRequest, "shipmentLines", []);
        const accessorialList = get(ltlRateRequest, "accessorialList", []);
        const reference = get(ltlRateRequest, "reference", []);
        set(queueData, "reference", reference);
        set(queueData, "payload", JSON.stringify(body));
        responseBodyFormat["transactionId"] = reference;

        const apiResponse = await Promise.all(
            ["FWDA", "EXLA", "FEXF", "ODFL", "ABFS", "AVRT", "DAFG", "SEFN", "PENS", "SAIA", "XPOL", "RDFS"].map(async (carrier) => {
                console.info(`🙂 -> file: ltl_rating.js:91 -> carrier:`, carrier);
                if (carrier === "FWDA") {
                    const fwdaStart = getNowTime();
                    const fwdaResp = await processFWDARequest({
                        pickupTime,
                        insuredValue,
                        shipperZip,
                        consigneeZip,
                        shipmentLines,
                        accessorialList,
                        carrier,
                    });
                    const fwdaEnd = getNowTime();
                    const fwdaTime = fwdaEnd - fwdaStart;
                    console.info(`🙂 -> file: ltl_rating.js:93 -> fwdaTime:`, fwdaTime);
                    return fwdaResp;
                }
                if (carrier === "EXLA") {
                    const exlaStart = getNowTime();
                    const exlaResp = await processEXLARequest({
                        pickupTime,
                        insuredValue,
                        shipperZip,
                        consigneeZip,
                        shipmentLines,
                        accessorialList,
                        reference,
                        carrier,
                    });
                    const exlaEnd = getNowTime();
                    const exlaTime = exlaEnd - exlaStart;
                    console.info(`🙂 -> file: ltl_rating.js:110 -> exlaTime:`, exlaTime);
                    return exlaResp;
                }
                if (carrier === "FEXF") {
                    const fexfStart = getNowTime();
                    const fexfResp = await processFEXFRequest({
                        pickupTime,
                        insuredValue,
                        shipperZip,
                        consigneeZip,
                        shipmentLines,
                        accessorialList,
                        reference,
                        carrier,
                    });
                    const fexfEnd = getNowTime();
                    const fexfTime = fexfEnd - fexfStart;
                    console.info(`🙂 -> file: ltl_rating.js:127 -> fexfTime:`, fexfTime);
                    return fexfResp;
                }
                if (carrier === "ODFL") {
                    const odflStart = getNowTime();
                    const odflResp = await processODFLRequest({
                        pickupTime,
                        insuredValue,
                        shipperZip,
                        consigneeZip,
                        shipmentLines,
                        accessorialList,
                        reference,
                        carrier,
                    });
                    const odflEnd = getNowTime();
                    const odflTime = odflEnd - odflStart;
                    console.info(`🙂 -> file: ltl_rating.js:144 -> odflTime:`, odflTime);
                    return odflResp;
                }
                if (carrier === "ABFS") {
                    const abfsStart = getNowTime();
                    const abfsResp = await processABFSRequest({
                        pickupTime,
                        insuredValue,
                        shipperZip,
                        consigneeZip,
                        shipmentLines,
                        accessorialList,
                        carrier,
                    });
                    const abfsEnd = getNowTime();
                    const abfsTime = abfsEnd - abfsStart;
                    console.info(`🙂 -> file: ltl_rating.js:160 -> abfsTime:`, abfsTime);
                    return abfsResp;
                }
                if (carrier === "AVRT") {
                    const avrtStart = getNowTime();
                    const avrtResp = await processAVRTRequest({
                        pickupTime,
                        insuredValue,
                        shipperZip,
                        consigneeZip,
                        shipmentLines,
                        accessorialList,
                        carrier,
                    });
                    const avrtEnd = getNowTime();
                    const avrtTime = avrtEnd - avrtStart;
                    console.info(`🙂 -> file: ltl_rating.js:176 -> avrtTime:`, avrtTime);
                    return avrtResp;
                }
                if (carrier === "DAFG") {
                    const dafgStart = getNowTime();
                    const dafgResp = await processDAFGRequest({
                        pickupTime,
                        insuredValue,
                        shipperZip,
                        consigneeZip,
                        shipmentLines,
                        accessorialList,
                        carrier,
                    });
                    const dafgEnd = getNowTime();
                    const dafgTime = dafgEnd - dafgStart;
                    console.info(`🙂 -> file: ltl_rating.js:192 -> dafgTime:`, dafgTime);
                    return dafgResp;
                }
                if (carrier === "SEFN") {
                    const sefnStart = getNowTime();
                    const sefnResp = await processSEFNRequest({
                        pickupTime,
                        insuredValue,
                        shipperZip,
                        consigneeZip,
                        shipmentLines,
                        accessorialList,
                        carrier,
                    });
                    const sefnEnd = getNowTime();
                    const sefnTime = sefnEnd - sefnStart;
                    console.info(`🙂 -> file: ltl_rating.js:208 -> sefnTime:`, sefnTime);
                    return sefnResp;
                }
                if (carrier === "PENS") {
                    const pensStart = getNowTime();
                    const pensResp = await processPENSRequest({
                        pickupTime,
                        insuredValue,
                        shipperZip,
                        consigneeZip,
                        shipmentLines,
                        accessorialList,
                        carrier,
                    });
                    const pensEnd = getNowTime();
                    const pensTime = pensEnd - pensStart;
                    console.info(`🙂 -> file: ltl_rating.js:224 -> pensTime:`, pensTime);
                    return pensResp;
                }
                if (carrier === "SAIA") {
                    const saiaStart = getNowTime();
                    const saiaResp = await processSAIARequest({
                        pickupTime,
                        insuredValue,
                        shipperZip,
                        consigneeZip,
                        shipmentLines,
                        accessorialList,
                        carrier,
                    });
                    const saiaEnd = getNowTime();
                    const saiaTime = saiaEnd - saiaStart;
                    console.info(`🙂 -> file: ltl_rating.js:240 -> saiaTime:`, saiaTime);
                    return saiaResp;
                }
                if (carrier === "XPOL") {
                    const xpolStart = getNowTime();
                    const xpolResp = await processXPOLRequest({
                        pickupTime,
                        insuredValue,
                        shipperZip,
                        consigneeZip,
                        shipmentLines,
                        accessorialList,
                        carrier,
                    });
                    const xpolEnd = getNowTime();
                    const xpolTime = xpolEnd - xpolStart;
                    console.info(`🙂 -> file: ltl_rating.js:256 -> xpolTime:`, xpolTime);
                    return xpolResp;
                }
                if (carrier === "RDFS") {
                    const rdfsStart = getNowTime();
                    const rdfsResp = await processRDFSRequest({
                        pickupTime,
                        insuredValue,
                        shipperZip,
                        consigneeZip,
                        shipmentLines,
                        accessorialList,
                        carrier,
                    });
                    const rdfsEnd = getNowTime();
                    const rdfsTime = rdfsEnd - rdfsStart;
                    console.info(`🙂 -> file: ltl_rating.js:272 -> rdfsTime:`, rdfsTime);
                    return rdfsResp;
                }
            })
        );
        console.info(`🙂 -> file: ltl_rating.js:127 -> apiResponse:`, JSON.stringify(apiResponse));
        const response = { ...responseBodyFormat };

        set(queueData, "status", 200);
        set(queueData, "response", JSON.stringify(response));
        payloadForQueue[0] = queueData;
        await sendMessageToQueue(payloadForQueue);
        const responseTime = getNowTime() - now;
        console.info(`🙂 -> file: ltl_rating.js:225 -> responseTime:`, responseTime);
        return response;
    } catch (err) {
        console.error(`🙂 -> file: ltl_rating.js:239 -> err:`, err);
        const response = {
            statusCode: 400,
            body: { message: err.message },
        };
        set(queueData, "status", 400);
        set(queueData, "response", err.message);
        payloadForQueue[0] = queueData;
        await sendMessageToQueue(payloadForQueue);
        return response;
    }
};

const responseBodyFormat = {
    transactionId: "",
    ltlRateResponse: [],
};

// ===================FWDA=======================
async function processFWDARequest({ pickupTime, insuredValue, shipperZip, consigneeZip, shipmentLines, accessorialList, carrier }) {
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
    url = FWDA_URL;
    headers = {
        user: FWDA_USER,
        password: FWDA_PASSWORD, //NOSONAR
        customerId: FWDA_CUSTOMERID,
        "Content-Type": "application/xml",
    };
    payload = xmlPayload;
    const response = await axiosRequest(url, payload, headers, "POST", carrier);
    if (!response) return false;
    await processFWDAResponses({ response });
    return { response };
}

async function processFWDAResponses({ response }) {
    try {
        let parser = new xml2js.Parser({ trim: true });
        const parsed = await parser.parseStringPromise(response);
        const FAQuoteResponse = get(parsed, "FAQuoteResponse", {});
        const ChargeLineItems = get(FAQuoteResponse, "ChargeLineItems[0].ChargeLineItem", []);
        const data = {
            carrier: "FWDA",
            serviceLevel: get(ChargeLineItems, "[0].ServiceLevel[0]", "0"),
            serviceLevelDescription: "",
            transitDays: parseInt(get(FAQuoteResponse, "TransitDaysTotal[0]")),
            totalRate: parseFloat(get(FAQuoteResponse, "QuoteTotal[0]")),
            message: "",
            accessorialList: [],
        };
        data["accessorialList"] = ChargeLineItems.map((chargeLineItem) => ({
            code: get(chargeLineItem, "Code[0]"),
            description: get(chargeLineItem, "Description[0]"),
            charge: parseFloat(get(chargeLineItem, "Amount[0]", 0)),
        }));
        responseBodyFormat["ltlRateResponse"].push(data);
    } catch (err) {
        console.info(`🙂 -> file: ltl_rating.js:737 -> err:`, err);
    }
}

// ===================EXLA=======================
async function processEXLARequest({ pickupTime, insuredValue, shipperZip, consigneeZip, shipmentLines, accessorialList, reference, carrier }) {
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
        soapAction: "http://ws.estesexpress.com/ratequote/getQuote", //NOSONAR
        "Content-Type": "text/xml",
    };
    let url = EXLA_URL;
    let payload = xmlPayload;
    const response = await axiosRequest(url, payload, headers, "POST", carrier);
    if (!response) return false;
    await processEXLAResponses({ response });
    return { response };
}

async function processEXLAResponses({ response }) {
    try {
        let parser = new xml2js.Parser({ trim: true });
        const parsed = await parser.parseStringPromise(response);
        const Envelope = get(parsed, "soapenv:Envelope", {});
        const Body = get(Envelope, "soapenv:Body[0]", {});
        const rateQuote = get(Body, "rat:rateQuote[0]", {});
        const quoteInfo = get(rateQuote, "rat:quoteInfo[0]", "");
        const quote = get(quoteInfo, "rat:quote", []);

        const quoteList = quote.map((quoteInfo) => {
            const serviceLevel = get(quoteInfo, "rat:serviceLevel[0].rat:id[0]", "0");
            const serviceLevelDescription = get(quoteInfo, "rat:serviceLevel[0].rat:text[0]", "");
            const quoteNumber = get(quoteInfo, "rat:quoteNumber[0]", "0");
            const pickup = get(quoteInfo, "rat:pickup[0].rat:date[0]", "0");
            const pickupDate = moment(new Date(pickup));
            const delivery = get(quoteInfo, "rat:delivery[0].rat:date[0]", "0");
            const deliveryDate = moment(new Date(delivery));
            const transitDays = deliveryDate.diff(pickupDate, "days");
            const totalRate = parseFloat(get(quoteInfo, "rat:pricing[0].rat:totalPrice[0]", "0"));
            const accessorialInfo = get(quoteInfo, "rat:accessorialInfo[0].rat:accessorial", []);

            const data = {
                carrier: "EXLA",
                quoteNumber,
                serviceLevel,
                serviceLevelDescription,
                transitDays: transitDays,
                totalRate,
                message: "",
                accessorialList: [],
            };
            data["accessorialList"] = accessorialInfo.map((accessorial) => ({
                code: get(accessorial, "rat:code[0]", ""),
                description: get(accessorial, "rat:description[0]", ""),
                charge: parseFloat(get(accessorial, "rat:charge[0]", 0)),
            }));
            return data;
        });
        responseBodyFormat["ltlRateResponse"] = [...responseBodyFormat["ltlRateResponse"], ...quoteList];
    } catch (err) {
        console.info(`🙂 -> file: ltl_rating.js:902 -> err:`, err);
    }
}

// ===================FEXF=======================
async function processFEXFRequest({ pickupTime, insuredValue, shipperZip, consigneeZip, shipmentLines, accessorialList, reference, carrier }) {
    const accessToken = await getTokenForFEXF();
    if (!accessToken) return;
    const payload = getXmlPayloadFEXF({
        pickupTime,
        insuredValue,
        shipperZip,
        consigneeZip,
        shipmentLines,
        accessorialList,
        reference,
    });
    let headers = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
    };
    let url = FEXF_URL;
    const response = await axiosRequest(url, payload, headers, "POST", carrier);
    if (!response) return false;
    processFEXFResponses({ response });
    return { response };
}

function processFEXFResponses({ response }) {
    const output = get(response, "output");
    const rateReplyDetails = get(output, "rateReplyDetails", []);
    rateReplyDetails.map((rateReplyDetail) => {
        const serviceLevel = get(rateReplyDetail, "serviceType");
        const transitDays = get(rateReplyDetail, "commit.transitDays.minimumTransitTime");
        const ratedShipmentDetails = get(rateReplyDetail, "ratedShipmentDetails", []);
        ratedShipmentDetails.map((ratedShipmentDetail) => {
            const rateType = get(ratedShipmentDetail, "rateType", "");
            const quoteNumber = get(ratedShipmentDetail, "quoteNumber");
            const totalRate = parseFloat(get(ratedShipmentDetail, "totalNetCharge"));
            const shipmentRateDetail = get(ratedShipmentDetail, "shipmentRateDetail.surCharges", []);

            const accessorialList = shipmentRateDetail.map((acc) => ({
                code: get(acc, "type"),
                description: get(acc, "description"),
                charge: parseFloat(get(acc, "amount", 0)),
            }));
            const data = {
                carrier: "FEXF",
                serviceLevel,
                serviceLevelDescription: "",
                transitDays: transitDaysMappingFEXF[transitDays],
                quoteNumber,
                totalRate,
                accessorialList,
            };
            if (rateType.toUpperCase() === "ACCOUNT") return responseBodyFormat["ltlRateResponse"].push(data);
        });
    });
}

// ===================ODFL=======================
async function processODFLRequest({ pickupTime, insuredValue, shipperZip, consigneeZip, shipmentLines, accessorialList, reference, carrier }) {
    const payload = getXmlPayloadODFL({
        pickupTime,
        insuredValue,
        shipperZip,
        consigneeZip,
        shipmentLines,
        accessorialList,
        reference,
    });
    let headers = {
        "Content-Type": "application/xml",
    };
    let url = ODFL_URL;
    const response = await axiosRequest(url, payload, headers, "POST", carrier);
    if (!response) return false;
    await processODFLResponses({ response });
    return { response };
}

async function processODFLResponses({ response }) {
    try {
        let parser = new xml2js.Parser({ trim: true });
        const parsed = await parser.parseStringPromise(response);
        const Body = get(parsed, "soapenv:Envelope.soapenv:Body[0]");
        const getLTLRateEstimateResponse = get(Body, "ns2:getLTLRateEstimateResponse[0]");
        const returnObj = get(getLTLRateEstimateResponse, "return[0]");
        const success = get(returnObj, "success[0]");
        const transitDays = parseInt(get(returnObj, "destinationCities[0].serviceDays[0]"));
        const quoteNumber = get(returnObj, "referenceNumber[0]");
        const rateEstimate = get(returnObj, "rateEstimate[0]");
        const totalRate = parseFloat(get(rateEstimate, "netFreightCharge[0]"));
        const accessorialList = get(rateEstimate, "accessorialCharges", []).map((acc) => ({
            code: "",
            description: get(acc, "description[0]"),
            charge: parseFloat(get(acc, "amount[0]", 0)),
        }));
        const data = {
            carrier: "ODFL",
            serviceLevel: "",
            serviceLevelDescription: "",
            transitDays,
            quoteNumber,
            totalRate,
            accessorialList,
        };
        if (success === true || success === "true") {
            responseBodyFormat["ltlRateResponse"].push(data);
        }
    } catch (err) {
        console.info(`🙂 -> file: ltl_rating.js:1428 -> err:`, err);
    }
}

// ===================ABFS=======================
async function processABFSRequest({ pickupTime, insuredValue, shipperZip, consigneeZip, shipmentLines, accessorialList, carrier }) {
    const payload = getXmlPayloadABFS({
        pickupTime,
        insuredValue,
        shipperZip,
        consigneeZip,
        shipmentLines,
        accessorialList,
    });
    let headers = {};
    const baseUrl = ABFS_BASEURL;
    const queryString = qs.stringify(payload);
    const url = `${baseUrl}?${queryString}`;
    const response = await axiosRequest(url, payload, headers, "get", carrier);
    if (!response) return false;
    await processABFSResponses({ response });
    return { response };
}

async function processABFSResponses({ response }) {
    try {
        let parser = new xml2js.Parser({ trim: true });
        const parsed = await parser.parseStringPromise(response);
        const afb = get(parsed, "ABF", {});
        const isError = Object.keys(afb).includes("ERROR");
        const quoteNumber = get(afb, "QUOTEID[0]");
        const totalRate = parseFloat(get(afb, "CHARGE[0]"));
        const transitDays = parseInt(get(afb, "ADVERTISEDTRANSIT[0]", 0), 10);
        const data = {
            carrier: "ABFS",
            serviceLevel: "",
            serviceLevelDescription: "",
            transitDays,
            quoteNumber,
            totalRate,
        };
        if (!isError) {
            responseBodyFormat["ltlRateResponse"].push(data);
        }
    } catch (err) {
        console.info(`🙂 -> file: ltl_rating.js:1551 -> err:`, err);
    }
}

// ===================AVRT=======================
async function processAVRTRequest({ pickupTime, insuredValue, shipperZip, consigneeZip, shipmentLines, accessorialList, carrier }) {
    const payload = getXmlPayloadAVRT({
        pickupTime,
        insuredValue,
        shipperZip,
        consigneeZip,
        shipmentLines,
        accessorialList,
    });
    let headers = {};
    const url = AVRT_URL;
    const response = await axiosRequest(url, payload, headers, "POST", carrier);
    if (!response) return false;
    processAVRTResponses({ response });
    return { response };
}

function processAVRTResponses({ response }) {
    const quoteDetails = get(response, "quoteDetails");
    const quoteNumber = get(quoteDetails, "rateQuoteNumber");
    const serviceLevelDescription = get(quoteDetails, "deliveryOption");
    const totalRate = parseFloat(get(quoteDetails, "totalCharge"));
    const transitDays = parseInt(get(quoteDetails, "estimatedServiceDays"));
    const accessorialList = get(response, "accessorialCharges", []).map((acc) => ({
        description: get(acc, "description"),
        charge: parseFloat(get(acc, "value", 0)),
    }));
    const data = {
        carrier: "AVRT",
        serviceLevel: "",
        serviceLevelDescription,
        transitDays,
        quoteNumber,
        totalRate,
        accessorialList,
    };
    responseBodyFormat["ltlRateResponse"].push(data);
}

// ===================DAFG=======================
async function processDAFGRequest({ pickupTime, insuredValue, shipperZip, consigneeZip, shipmentLines, accessorialList, carrier }) {
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
    const url = DAFG_URL;
    const response = await axiosRequest(url, JSON.stringify(payload), headers, "POST", carrier);
    if (!response) return false;
    processDAFGResponses({ response });
    return { response };
}

function processDAFGResponses({ response }) {
    const quoteNumber = get(response, "id");
    const totalRate = parseFloat(get(response, "total"));
    const transitDays = parseInt(get(response, "serviceEligibility.serviceDays"));
    const accessorialList = get(response, "accessorials", []).map((acc) => ({
        code: get(acc, "code"),
        description: get(acc, "name"),
        charge: parseFloat(get(acc, "amount", 0)),
    }));
    const data = {
        carrier: "DAFG",
        serviceLevel: "",
        serviceLevelDescription: "",
        transitDays,
        quoteNumber,
        totalRate,
        accessorialList,
    };
    responseBodyFormat["ltlRateResponse"].push(data);
}

// ===================SEFN=======================
async function processSEFNRequest({ pickupTime, insuredValue, shipperZip, consigneeZip, shipmentLines, accessorialList, carrier }) {
    const payload = getXmlPayloadSEFN({
        pickupTime,
        insuredValue,
        shipperZip,
        consigneeZip,
        shipmentLines,
        accessorialList,
    });
    let headers = {};
    const baseUrl = SEFN_BASEURL;
    const query = qs.stringify(payload);
    const url = `${baseUrl}?${query}`;
    const response = await axiosRequest(url, payload, headers, "get", carrier);
    if (!response) return false;
    await processSEFNResponses({ response });
    return { response };
}

async function processSEFNResponses({ response }) {
    try {
        let parser = new xml2js.Parser({ trim: true });
        const parsed = await parser.parseStringPromise(response);
        const dataRoot = get(parsed, "root");
        const error = get(dataRoot, "error[0]") !== "";
        const quoteNumber = get(dataRoot, "quoteId[0]");
        const totalRate = parseFloat(get(dataRoot, "rateQuote[0]"));
        const transitDays = parseInt(get(dataRoot, "transitTime[0]"));
        const details = get(dataRoot, "details[0]");
        const typeCharge = get(details, "typeCharge", []);
        const descArray = get(details, "description", []);
        const chargeArray = get(details, "charges", []);
        const accessorialList = [];
        for (let index = 0; index < typeCharge.length; index++) {
            const code = typeCharge[index] ?? "";
            const description = descArray[index] ?? "";
            const charge = chargeArray[index] ?? 0;
            accessorialList.push({
                code,
                description,
                charge: parseFloat(charge),
            });
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
    } catch (err) {
        console.info(`🙂 -> file: ltl_rating.js:1891 -> err:`, err);
    }
}

// ===================PENS=======================
async function processPENSRequest({ pickupTime, insuredValue, shipperZip, consigneeZip, shipmentLines, accessorialList, carrier }) {
    const payload = getXmlPayloadPENS({
        pickupTime,
        insuredValue,
        shipperZip,
        consigneeZip,
        shipmentLines,
        accessorialList,
    });
    let headers = { "Content-Type": "application/soap+xml; charset=utf-8" };
    const url = PENS_URL;
    const response = await axiosRequest(url, payload, headers, "POST", carrier);
    if (!response) return false;
    await processPENSResponses({ response });
    return { response };
}

async function processPENSResponses({ response }) {
    try {
        let parser = new xml2js.Parser({ trim: true });
        const parsed = await parser.parseStringPromise(response);
        const CreatePensRateQuoteResponse = get(parsed, "soap:Envelope.soap:Body[0].CreatePensRateQuoteResponse[0].CreatePensRateQuoteResult[0]");
        const error = get(CreatePensRateQuoteResponse, "errors[0]", false);
        const quote = get(CreatePensRateQuoteResponse, "quote[0]");
        const quoteNumber = get(quote, "quoteNumber[0]");
        const totalRate = parseFloat(get(quote, "totalCharge[0]", "0").replace(/\$/g, ""));
        const transitDays = parseInt(get(transitDaysMappingPENS, get(quote, "transitType[0]", "").replace(/[^a-zA-Z]/g, ""), "##"));
        const message = get(quote, "quoteRemark.remarkItem", "");
        const accessorialDetail = get(quote, "accessorialDetail[0].AccessorialItem", []);
        const accessorialList = accessorialDetail.map((acc) => ({
            code: get(acc, "code[0]"),
            description: get(acc, "description[0]"),
            charge: parseFloat(get(acc, "charge[0]", 0)),
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
    } catch (err) {
        console.info(`🙂 -> file: ltl_rating.js:2039 -> err:`, err);
    }
}

// ===================SAIA=======================
async function processSAIARequest({ pickupTime, insuredValue, shipperZip, consigneeZip, shipmentLines, accessorialList, carrier }) {
    const payload = getXmlPayloadSAIA({
        pickupTime,
        insuredValue,
        shipperZip,
        consigneeZip,
        shipmentLines,
        accessorialList,
    });
    let headers = { "Content-Type": "text/xml; charset=utf-8" };
    const url = SAIA_URL; //NOSONAR
    const response = await axiosRequest(url, payload, headers, "POST", carrier);
    if (!response) return false;
    await processSAIAResponses({ response });
    return { response };
}

async function processSAIAResponses({ response }) {
    try {
        let parser = new xml2js.Parser({ trim: true });
        const parsed = await parser.parseStringPromise(response);
        const body = get(parsed, "soap:Envelope.soap:Body[0].CreateResponse[0].CreateResult[0]");
        const error = get(body, "Message[0]", "") !== "";
        console.info(`🙂 -> file: ltl_rating.js:2093 -> error:`, error);
        const quoteNumber = get(body, "QuoteNumber[0]");
        const totalRate = parseFloat(get(body, "TotalInvoice[0]", "0"));
        const transitDays = parseInt(get(body, "StandardServiceDays[0]", ""));
        const accessorialList = get(body, "RateAccessorials[0].RateAccessorialItem", []).map((acc) => ({
            code: get(acc, "Code[0]"),
            description: get(acc, "Description[0]"),
            charge: parseFloat(get(acc, "Amount[0]", 0)),
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
        if (!error) responseBodyFormat["ltlRateResponse"].push(data);
    } catch (err) {
        console.info(`🙂 -> file: ltl_rating.js:2182 -> err:`, err);
    }
}

// ===================XPOL=======================
async function processXPOLRequest({ pickupTime, insuredValue, shipperZip, consigneeZip, shipmentLines, accessorialList, carrier }) {
    const payload = getXmlPayloadXPOL({
        pickupTime,
        insuredValue,
        shipperZip,
        consigneeZip,
        shipmentLines,
        accessorialList,
    });
    const token = await getTokenForXPOL();
    let headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
    };
    const url = XPOL_URL;
    const response = await axiosRequest(url, payload, headers, "POST", carrier);
    if (!response) return false;
    await processXPOLResponses({ response });
    return { response };
}

async function processXPOLResponses({ response }) {
    const body = get(response, "data");
    const quoteNumber = get(body, "rateQuote.confirmationNbr");
    const totalRate = parseFloat(get(body, "rateQuote.totCharge[0].amt", "0"));
    const transitDays = parseInt(get(body, "transitTime.transitDays", ""));
    const accessorialList = get(body, "rateQuote.shipmentInfo.accessorials", []).map((acc) => ({
        code: get(acc, "accessorialCd"),
        description: get(acc, "accessorialDesc"),
        charge: parseFloat(get(acc, "chargeAmt.amt", 0)),
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
    responseBodyFormat["ltlRateResponse"].push(data);
}

async function getTokenForXPOL() {
    const xpolTokenStart = getNowTime();
    const dynamoResponse = await getXPOLTokenFromDynamo();
    if (dynamoResponse) return dynamoResponse;
    const url = XPOL_TOKEN_URL;
    const headers = {
        Authorization: "Basic " + XPOL_AUTHORIZATION,
        "Content-Type": "application/x-www-form-urlencoded",
    };
    let data = qs.stringify({
        access_token: XPOL_ACCESS_TOKEN,
        refresh_token: XPOL_REFRESH_TOKEN,
        scope: "default",
        token_type: "Bearer",
        expires_in: XPOL_EXPIRES_IN,
    });
    const { access_token } = await axiosRequest(url, data, headers);
    await putXPOLTokenFromDynamo(access_token);
    const xpolTokenEnd = getNowTime();
    const xpolGetTokenTime = xpolTokenEnd - xpolTokenStart;
    console.info(`🙂 -> file: ltl_rating.js:1893 -> xpolGetTokenTime:`, xpolGetTokenTime);
    return access_token;
}

async function getXPOLTokenFromDynamo() {
    const params = {
        TableName: LTL_LOG_TABLE,
        // TableName: "omni-dw-api-services-ltl-rating-logs-dev",
        // Key: {
        //     pKey: "token",
        //     sKey: moment().format("DD-MM-YYYY"),
        // },
        KeyConditionExpression: "#pKey = :pKey and #sKey = :sKey",
        FilterExpression: "#expirations >= :expirations",
        ExpressionAttributeNames: {
            "#pKey": "pKey",
            "#sKey": "sKey",
            "#expirations": "validUpto",
        },
        ExpressionAttributeValues: {
            ":pKey": "XPOL",
            ":sKey": "token",
            ":expirations": getUnixTime(),
        },
    };
    console.info(`🙂 -> file: ltl_rating.js:1920 -> params:`, params);
    try {
        let data = await dynamoDB.query(params).promise();
        console.info("QUERY RESP :", data);
        return get(data, "Items[0].token", false);
    } catch (err) {
        const errResponse = JSON.stringify(get(err, "response.data", ""));
        console.error(`🙂 -> file: ltl_rating.js:2284 -> err:`, errResponse !== "" ? errResponse : err);
        throw err;
    }
}

async function putXPOLTokenFromDynamo(token) {
    const params = {
        TableName: LTL_LOG_TABLE,
        Item: {
            pKey: "XPOL",
            sKey: "token",
            token: token,
            validUpto: Math.floor(new Date(moment().add(11, "hours").format()).getTime() / 1000),
        },
    };
    try {
        let data = await dynamoDB.put(params).promise();
        console.info("QUERY RESP :", data);
        return data;
    } catch (err) {
        const errResponse = JSON.stringify(get(err, "response.data", ""));
        console.error(`🙂 -> file: ltl_rating.js:2311 -> err:`, errResponse !== "" ? errResponse : err);
        throw err;
    }
}

// ===================RDFS=======================
async function processRDFSRequest({ pickupTime, insuredValue, shipperZip, consigneeZip, shipmentLines, accessorialList, carrier }) {
    const payload = getXmlPayloadRDFS({
        pickupTime,
        insuredValue,
        shipperZip,
        consigneeZip,
        shipmentLines,
        accessorialList,
    });

    let headers = {
        "Content-Type": "text/xml; charset=utf-8",
    };
    const url = RDFS_URL;
    const response = await axiosRequest(url, payload, headers, "POST", carrier);
    if (!response) return false;
    await processRDFSResponses({ response });
    return { response };
}

async function processRDFSResponses({ response }) {
    try {
        let parser = new xml2js.Parser({ trim: true });
        const parsed = await parser.parseStringPromise(response);
        const body = get(parsed, "soap:Envelope.soap:Body[0].RateQuoteResponse[0].RateQuoteResult[0]");
        const quoteNumber = get(body, "QuoteNumber[0]");
        const totalRate = parseFloat(get(body, "NetCharge[0]", "0"));
        const transitDays = parseInt(get(body, "RoutingInfo[0].EstimatedTransitDays[0]", ""));
        const accessorialList = get(body, "RateDetails[0].QuoteDetail", []).map((acc) => ({
            code: get(acc, "Code[0]"),
            description: get(acc, "Description[0]"),
            charge: parseFloat(get(acc, "Charge[0]", 0)),
        }));
        const data = {
            carrier: "RDFS",
            serviceLevel: "",
            serviceLevelDescription: "",
            quoteNumber,
            transitDays,
            totalRate,
            accessorialList,
        };
        responseBodyFormat["ltlRateResponse"].push(data);
    } catch (err) {
        console.info(`🙂 -> file: ltl_rating.js:2520 -> err:`, err);
    }
}

async function axiosRequest(url, payload, header = {}, method = "POST", carrier = "") {
    console.info(`🙂 -> file: ltl_rating.js:990 -> ${carrier} -> url, payload, header, method, carrier:`, url, JSON.stringify(payload), header, method, carrier);
    const logData = {};
    set(logData, "carrier", carrier);
    set(logData, "payload", JSON.stringify(payload));
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
            console.info(`🙂 -> file: ltl_rating.js:2758 -> ${carrier} -> res.status:`, JSON.stringify(get(res, "data", {})));
            set(logData, "status", get(res, "status"));
            set(logData, "response", JSON.stringify(get(res, "data", "")));
            payloadForQueue.push(logData);
            return get(res, "data", {});
        } else {
            return false;
        }
    } catch (err) {
        const errResponse = JSON.stringify(get(err, "response.data", ""));
        console.error(`🙂 -> file: ltl_rating.js:2728 -> ${carrier} -> err:`, errResponse !== "" ? errResponse : err);
        set(logData, "status", get(err, "response.status"));
        set(logData, "response", errResponse !== "" ? JSON.stringify(errResponse) : err);
        payloadForQueue.push(logData);
        return false;
    }
}
