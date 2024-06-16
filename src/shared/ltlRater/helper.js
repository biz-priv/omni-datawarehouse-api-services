/*
* File: src\shared\ltlRater\helper.js
* Project: Omni-datawarehouse-api-services
* Author: Bizcloud Experts
* Date: 2023-12-18
* Confidential and Proprietary
*/
const AWS = require("aws-sdk");
const { get } = require("lodash");
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const sqs = new AWS.SQS();
const qs = require('qs')
const { LTL_LOG_TABLE, LOG_QUEUE } = process.env;

async function putFEXFTokenIntoDynamo(token) {
    const params = {
        TableName: LTL_LOG_TABLE,
        Item: {
            pKey: "FEXF",
            sKey: "token",
            token: token,
            validUpto: Math.floor(new Date(moment().add(58, "minutes").format()).getTime() / 1000),
        },
    };
    try {
        let data = await dynamoDB.put(params).promise();
        return data;
    } catch (err) {
        const errResponse = JSON.stringify(get(err, "response.data", ""));
        console.error(`🙂 -> file: ltl_rating.js:2311 -> err:`, errResponse !== "" ? errResponse : err);
        throw err;
    }
}

async function getXFEXFTokenFromDynamo() {
    const params = {
        TableName: LTL_LOG_TABLE,
        KeyConditionExpression: "#pKey = :pKey and #sKey = :sKey",
        FilterExpression: "#expirations >= :expirations",
        ExpressionAttributeNames: {
            "#pKey": "pKey",
            "#sKey": "sKey",
            "#expirations": "validUpto",
        },
        ExpressionAttributeValues: {
            ":pKey": "FEXF",
            ":sKey": "token",
            ":expirations": getUnixTime(),
        },
    };
    console.info(`🙂 -> file: ltl_rating.js:1920 -> params:`, params);
    try {
        let data = await dynamoDB.query(params).promise();
        console.info(`🙂 -> file: ltl_rating.js:2400 -> data:`, data);
        return get(data, "Items[0].token", false);
    } catch (err) {
        const errResponse = JSON.stringify(get(err, "response.data", ""));
        console.error(`🙂 -> file: ltl_rating.js:2284 -> err:`, errResponse !== "" ? errResponse : err);
        throw err;
    }
}

async function getTokenForFEXF() {
    const fexfTokenStart = getNowTime();
    const dynamoResponse = await getXFEXFTokenFromDynamo();
    if (dynamoResponse) return dynamoResponse;
    const access_token = await processFEXFAuthRequest();
    if (!access_token) return false;
    await putFEXFTokenIntoDynamo(access_token);
    const fexfTokenEnd = getNowTime();
    const fexfGetTokenTime = fexfTokenEnd - fexfTokenStart;
    console.info(`🙂 -> file: ltl_rating.js:2377 -> fexfGetTokenTime:`, fexfGetTokenTime);
    return access_token;
}

async function processFEXFAuthRequest() {
    try {
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
        console.info(`🙂 -> file: ltl_rating.js:1031 -> authReqRes:`, get(authReqRes, "data"));
        return get(authReqRes, "data.access_token");
    } catch (err) {
        const errResponse = JSON.stringify(get(err, "response.data", ""));
        console.error(`🙂 -> file: ltl_rating.js:1043 -> err:`, errResponse !== "" ? errResponse : err);
        return false;
    }
}

function getNowTime() {
    return new Date().getTime();
}

function getUnixTime(dateTime = new Date()) {
    return Math.floor(new Date(dateTime).getTime() / 1000);
}

async function sendMessageToQueue(payloadForQueue) {
    const sendMessageStart = getNowTime();
    try {
        const queueMessage = {
            QueueUrl: LOG_QUEUE,
            MessageBody: JSON.stringify({
                payloadForQueue,
            }),
        };
        console.info(`🙂 -> file: ltl_rating.js:2218 -> queueMessage:`, queueMessage);
        await sqs.sendMessage(queueMessage).promise();
        const sendMessageEnd = getNowTime();
        const sendMessageTime = sendMessageEnd - sendMessageStart;
        console.info(`🙂 -> file: ltl_rating.js:2283 -> sendMessageTime:`, sendMessageTime);
    } catch (err) {
        console.error(`🙂 -> file: ltl_rating.js:2221 -> err:`, err);
        return false;
    }
}

const accessorialMappingFWDA = {
    APPT: "APP",
    INSPU: "IPU",
    RESID: "RPU",
    LIFT: "LGP",

    APPTD: "ADE",
    INDEL: "IDE",
    RESDE: "RDE",
    LIFTD: "LGD",
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
    EIGHT_DAYS: 8,
    EIGHTEEN_DAYS: 18,
    ELEVEN_DAYS: 11,
    FIFTEEN_DAYS: 15,
    FIVE_DAYS: 5,
    FOUR_DAYS: 4,
    FOURTEEN_DAYS: 14,
    NINE_DAYS: 9,
    NINETEEN_DAYS: 19,
    ONE_DAY: 1,
    SEVEN_DAYS: 7,
    SEVENTEEN_DAYS: 17,
    SIX_DAYS: 6,
    SIXTEEN_DAYS: 16,
    TEN_DAYS: 10,
    THIRTEEN_DAYS: 13,
    THREE_DAYS: 3,
    TWELVE_DAYS: 12,
    TWENTY_DAYS: 20,
    TWO_DAYS: 2,
    SMARTPOST_TRANSIT_DAYS: 7,
    UNKNOWN: 99,
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

const accessorialMappingRDFS = {
    APPT: "APT",
    INSPU: "IP",
    RESID: "RSP",
    LIFT: "LGP",
    APPTD: "APT",
    INDEL: "ID",
    RESDE: "RSD",
    LIFTD: "LGD",
};
module.exports = { accessorialMappingRDFS, accessorialMappingXPOL, accessorialMappingSAIA, accessorialMappingPENS, transitDaysMappingPENS, accessorialMappingSEFN, accessorialMappingDAFG, pieceTypeMappingABFS, transitDaysMappingFEXF, accessorialMappingFEXF, freightClassFEXF, pieceTypeMappingEXLA, unitMapping, accessorialMappingODFL, accessorialMappingEXLA, accessorialMappingFWDA, sendMessageToQueue, getUnixTime, getNowTime, getTokenForFEXF, getXFEXFTokenFromDynamo };
