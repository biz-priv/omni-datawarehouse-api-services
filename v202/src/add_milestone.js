const { v4: uuidv4 } = require("uuid");
const momentTZ = require("moment-timezone");
const { get } = require("lodash");
const Joi = require("joi");
const { convert } = require("xmlbuilder2");
const axios = require("axios");
const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const cloudwatch = new AWS.CloudWatch();

const {
    MILESTONE_ORDER_STATUS,
    ADD_MILESTONE_LOGS_TABLE,
    P44_LOCATION_UPDATES_TABLE,
} = process.env;

const statusCodes = MILESTONE_ORDER_STATUS.split(",");
const statusCodeValidation = Joi.string()
    .alphanum()
    .required()
    .valid(...statusCodes);

const eventValidation = Joi.object()
    .keys({
        addMilestoneRequest: Joi.object()
            .keys({
                housebill: Joi.string().required(),
                statusCode: statusCodeValidation,
                eventTime: Joi.string().required(),
            })
            .required(),
    })
    .required();

const eventDelValidation = Joi.object()
    .keys({
        addMilestoneRequest: Joi.object()
            .keys({
                housebill: Joi.string().required(),
                statusCode: statusCodeValidation,
                eventTime: Joi.string().required(),
                signatory: Joi.string().required(),
            })
            .required(),
    })
    .required();

const eventLocValidation = Joi.object()
    .keys({
        addMilestoneRequest: Joi.object()
            .keys({
                housebill: Joi.string().required(),
                statusCode: statusCodeValidation,
                eventTime: Joi.string().required(),
                latitude: Joi.number().required(),
                longitude: Joi.number().required(),
            })
            .required(),
    })
    .required();

let itemObj = {
    id: uuidv4().toString(),
    housebill: "",
    statusCode: "",
    latitude: "",
    longitude: "",
    eventTime: "",
    signatory: "",
    createdAt: momentTZ.tz("America/Chicago").format("YYYY-MM-DD HH:mm:ss").toString(),
    payload: "",
    xmlRequestPayload: "",
    xmlResponsePayload: "",
    errorMsg: "",
    status: "",
    version: "v2.2",
}

module.exports.handler = async (event, context, callback) => {
    console.log("Event: ", event);
    try {
        const { body } = event;

        itemObj.housebill = get(body, "addMilestoneRequest.housebill", "");
        itemObj.statusCode = get(body, "addMilestoneRequest.statusCode", "");
        itemObj.latitude = get(body, "addMilestoneRequest.latitude", "");
        itemObj.longitude = get(body, "addMilestoneRequest.longitude", "");
        itemObj.eventTime = get(body, "addMilestoneRequest.eventTime", "");
        itemObj.signatory = get(body, "addMilestoneRequest.signatory", "");
        itemObj.payload = body;

        if (get(body, "addMilestoneRequest", null) === null) {
            itemObj.errorMsg = "addMilestoneRequest is required";
            await putItem(ADD_MILESTONE_LOGS_TABLE, itemObj);
            await sendAlarm("addMilestoneRequest is required");
            return callback(response("[400]", "addMilestoneRequest is required"));
        }
        const statusCode = get(body, "addMilestoneRequest.statusCode", "")
        let validationData = ""
        if (statusCode == "DEL" || statusCode == "LOC") {
            if (statusCode == "DEL") {
                validationData = eventDelValidation.validate(body);
            }else{
                validationData = eventLocValidation.validate(body);
            }
        } else {
            validationData = eventValidation.validate(body);
        }
        const { error, value } = validationData;
        console.info("validated data", value);
        if (error) {
            let msg = get(error, "details[0].message", "")
                .split('" ')[1]
                .replace(/"/g, "");
            let key = get(error, "details[0].context.key", "");

            itemObj.errorMsg = key + " " + msg
            console.log("eventLogObj", itemObj);
            await putItem(ADD_MILESTONE_LOGS_TABLE, itemObj);
            await sendAlarm(key + " " + msg)
            return callback(response("[400]", key + " " + msg));
        }

        return await sendEvent(body, callback);

    } catch (error) {
        console.error("Main lambda error: ", error)
        let errorMsgVal = ""
        if (get(error, "message", null) === null) {
            errorMsgVal = get(error, "message", "");
        } else {
            errorMsgVal = error;
        }
        itemObj.errorMsg = errorMsgVal;
        await putItem(ADD_MILESTONE_LOGS_TABLE, itemObj);
        await sendAlarm(`Main Lambda Error: ${errorMsgVal}`);
        return callback(response("[400]", errorMsgVal));
    }
}

async function sendEvent(body, callback) {
    try {
        const addMilestoneData = get(body, "addMilestoneRequest", "");
        const eventBody = {
            ...addMilestoneData,
            eventTime: get(addMilestoneData, "eventTime", "").replace("Z", "+00:00"),
        };

        const postData = makeJsonToXml(eventBody);
        console.info("postData", postData);
        itemObj.xmlRequestPayload = postData;
        await putItem(ADD_MILESTONE_LOGS_TABLE, itemObj);

        const dataResponse = await addMilestoneApi(postData);
        console.info("dataResponse", dataResponse);
        itemObj.xmlResponsePayload = dataResponse;

        const responseObj = makeXmlToJson(dataResponse);
        console.info("responseObj", responseObj);

        const updateParams = {
            TableName: ADD_MILESTONE_LOGS_TABLE,
            Key: {
                id: get(itemObj, "id", ""),
            },
            UpdateExpression:
                "set #status = :status, #xmlResponsePayload = :xmlResponsePayload",
            ExpressionAttributeNames: {
                "#status": "status",
                "#xmlResponsePayload": "xmlResponsePayload",
            },
            ExpressionAttributeValues: {
                ":status": get(responseObj, "addMilestoneResponse.message", ""),
                ":xmlResponsePayload": dataResponse
            },
            ReturnValues: "UPDATED_NEW",
        };
        await updateItem(updateParams);
        if (get(responseObj, "addMilestoneResponse.message", "") === "success") {
            if (get(itemObj, "statusCode", "") == "LOC") {
                const locItems = {
                    HouseBillNo: get(itemObj, "housebill", ""),
                    UTCTimeStamp: momentTZ(get(itemObj, "eventTime", "").slice(0, 19)).add(5, 'hours').format('YYYY-MM-DDTHH:mm:ss'),
                    CorrelationId: get(itemObj, "id", ""),
                    InsertedTimeStamp: momentTZ.tz("America/Chicago").format("YYYY-MM-DD HH:mm:ss").toString(),
                    latitude: get(itemObj, "latitude", ""),
                    longitude: get(itemObj, "longitude", ""),
                }
                await putItem(P44_LOCATION_UPDATES_TABLE, locItems);
            }
            return responseObj;
        } else {
            return callback(response("[400]", "failed"));
        }
    } catch (error) {
        console.error('Error while posting event:', error);
        let errorMsgVal = ""
        if (get(error, "message", null) === null) {
            errorMsgVal = get(error, "message", "");
        } else {
            errorMsgVal = error;
        }
        const updateParams = {
            TableName: ADD_MILESTONE_LOGS_TABLE,
            Key: {
                id: get(itemObj, "id", ""),
            },
            UpdateExpression:
                "set #errorMsg = :errorMsg",
            ExpressionAttributeNames: {
                "#errorMsg": "errorMsg",
            },
            ExpressionAttributeValues: {
                ":errorMsg": errorMsgVal.toString(),
            },
            ReturnValues: "UPDATED_NEW",
        };
        await updateItem(updateParams);
        await sendAlarm(`Main Lambda Error: ${errorMsgVal}`);
        return callback(response("[400]", errorMsgVal));
    }
}

function makeJsonToXml(data) {
    let xml = "";
    if (get(data, "statusCode", "") === "DEL") {
        xml = convert({
            "soap:Envelope": {
                "@xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
                "@xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
                "@xmlns:soap": "http://schemas.xmlsoap.org/soap/envelope/",
                "soap:Body": {
                    SubmitPOD: {
                        "@xmlns": "http://tempuri.org/",//NOSONAR
                        HAWB: get(data, "housebill", ""),
                        UserName: "BIZCLOUD",
                        UserInitials: "BCE",
                        Signer: get(data, "signatory", ""),
                        PODDateTime: get(data, "eventTime", ""),
                    },
                },
            },
        });
    } else if (get(data, "statusCode", "") === "LOC") {
        xml = convert({
            "soap:Envelope": {
                "@xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
                "@xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
                "@xmlns:soap": "http://schemas.xmlsoap.org/soap/envelope/",
                "soap:Header": {
                    "AuthHeader": {
                        "@xmlns": "http://tempuri.org/",//NOSONAR
                        "UserName": "eeprod",
                        "Password": "eE081020!"
                    }
                },
                "soap:Body": {
                    "WriteTrackingNote": {
                        "@xmlns": "http://tempuri.org/",//NOSONAR
                        "HandlingStation": "",
                        "HouseBill": get(data, "housebill", ""),
                        "TrackingNotes": {
                            "TrackingNotes": {
                                "TrackingNoteMessage": `Latitude=${get(data, "latitude", "")} Longitude=${get(data, "longitude", "")}`
                            }
                        }
                    }
                }
            }
        });
    } else {
        xml = convert({
            "soap:Envelope": {
                "@xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
                "@xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
                "@xmlns:soap": "http://schemas.xmlsoap.org/soap/envelope/",
                "soap:Body": {
                    UpdateStatus: {
                        "@xmlns": "http://tempuri.org/",//NOSONAR
                        HandlingStation: "",
                        HAWB: get(data, "housebill", ""),
                        UserName: "BIZCLOUD",
                        StatusCode: get(data, "statusCode", ""),
                        EventDateTime: get(data, "eventTime", ""),
                    },
                },
            },
        });
    }
    console.info("xml payload", xml);
    return xml;
}

async function addMilestoneApi(postData) {
    try {
        const res = await axios.post(process.env.ADD_MILESTONE_URL, postData, {
            headers: {
                Accept: "text/xml",
                "Content-Type": "text/xml",
            },
        });
        if (get(res, "status", "") == 200) {
            return get(res, "data", "");
        } else {
            itemObj.xmlResponsePayload = get(res, "data", "");
            throw new Error(`API Request Failed: ${res}`);
        }
    } catch (error) {
        console.error("e:addMilestoneApi", error);
        throw error;
    }
}

function makeXmlToJson(data) {
    try {
        let obj = convert(data, { format: "object" });
        console.info("obj:makeXmlToJson", JSON.stringify(obj));
        let message;
        if (get(itemObj, "statusCode", "") === "DEL") {
            message =
                get(obj, "soap:Envelope.soap:Body.SubmitPODResponse.SubmitPODResult", "");
        } else {
            message =
                get(obj, "soap:Envelope.soap:Body.UpdateStatusResponse.UpdateStatusResult", "");
        }
        return {
            addMilestoneResponse: {
                message: message === "true" ? "success" : "failed",
                id: get(itemObj, "id", "")
            },
        };
    } catch (error) {
        console.error("e:makeXmlToJson", error);
        throw error;
    }
}

async function putItem(tableName, item) {
    let params;
    try {
        params = {
            TableName: tableName,
            Item: item,
        };
        console.info("Insert Params: ", params)
        return await dynamodb.put(params).promise();
    } catch (e) {
        console.error("Put Item Error: ", e, "\nPut params: ", params);
        throw new Error("PutItemError");
    }
}

async function updateItem(params) {
    try {
        console.info("Update Params: ", params)
        return await dynamodb.update(params).promise();
    } catch (e) {
        console.error("Update Item Error: ", e, "\nUpdate params: ", params);
        throw new Error("UpdateItemError");
    }
}

async function sendAlarm(reason) {
    try {
        const params = {
            AlarmName: 'add-milestone-lambda-alarm',
            StateValue: 'ALARM',
            StateReason: reason,
        };

        console.info("cloudwatch alarm params: ", params)
        const alarmData = await cloudwatch.setAlarmState(params).promise();
        console.info("Alarm sent to cloudwatch, request Id: ", get(alarmData, "ResponseMetadata.RequestId", ""))

    } catch (error) {
        console.error('Error while sending cloudwatch alarm:', error);
    }
}


function response(code, message) {
    return JSON.stringify({
        httpStatus: code,
        message,
    });
}
