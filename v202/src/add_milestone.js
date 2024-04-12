const { v4: uuidv4 } = require("uuid");
const momentTZ = require("moment-timezone");
const { get } = require("lodash");
const Joi = require("joi");
const { convert } = require("xmlbuilder2");
const axios = require("axios");
const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const cloudwatch = new AWS.CloudWatch();
const sns = new AWS.SNS();

const {
    MILESTONE_ORDER_STATUS,
    ADD_MILESTONE_LOGS_TABLE,
    P44_LOCATION_UPDATES_TABLE,
    wt_soap_username
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
                statusCode: Joi.string().required(),
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
                statusCode: Joi.string().required(),
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
                statusCode: Joi.string().required(),
                eventTime: Joi.string().required(),
                latitude: Joi.number().required(),
                longitude: Joi.number().required(),
            })
            .required(),
    })
    .required();

    const eventOthValidation = Joi.object()
    .keys({
        addMilestoneRequest: Joi.object()
            .keys({
                housebill: Joi.string().required(),
                statusCode: Joi.string().required(),
                note: Joi.string().required(),
                eventTime: Joi.string().required(),
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
    note: "",
    createdAt: momentTZ.tz("America/Chicago").format("YYYY-MM-DD HH:mm:ss").toString(),
    payload: "",
    xmlRequestPayload: "",
    xmlResponsePayload: "",
    errorMsg: "",
    status: "",
    version: "v2.2",
}

let functionName = ""
module.exports.handler = async (event, context, callback) => {
    console.log("Event: ", event);
    functionName = context.functionName;
    try {
        const { body } = event;

        itemObj.housebill = get(body, "addMilestoneRequest.housebill", "");
        itemObj.statusCode = get(body, "addMilestoneRequest.statusCode", "");
        itemObj.latitude = get(body, "addMilestoneRequest.latitude", "");
        itemObj.longitude = get(body, "addMilestoneRequest.longitude", "");
        itemObj.eventTime = get(body, "addMilestoneRequest.eventTime", "");
        itemObj.signatory = get(body, "addMilestoneRequest.signatory", "");
        itemObj.note = get(body, "addMilestoneRequest.note", "");
        itemObj.payload = body;

        if (get(body, "addMilestoneRequest", null) === null) {
            itemObj.errorMsg = "Given input body requires addMilestoneRequest data";
            await putItem(ADD_MILESTONE_LOGS_TABLE, itemObj);
            return { statusCode: 400, message: "Given input body requires addMilestoneRequest data" };
        }
        const statusCode = get(body, "addMilestoneRequest.statusCode", "")
        let validationData = ""
        if (statusCode == "DEL" || statusCode == "LOC" || statusCode == "OTH") {
            if (statusCode == "DEL") {
                validationData = eventDelValidation.validate(body);
            } else if (statusCode == "LOC") {
                validationData = eventLocValidation.validate(body);
            }else{
                validationData = eventOthValidation.validate(body);
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
            return { statusCode: 400, message: key + " " + msg };
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
        await sendsns(`Main Lambda Error: ${errorMsgVal}`);
        return { statusCode: 400, message: errorMsgVal };
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
            return { id: itemObj.id, message: "failed" };
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
        await sendsns(`Error while sending event to world trak: ${errorMsgVal}`);
        return { statusCode: 400, message: errorMsgVal };
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
                        UserName: wt_soap_username,
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
                        "UserName": wt_soap_username,
                        "Password": wt_soap_password
                    }
                },
                "soap:Body": {
                    "WriteTrackingNote": {
                        "@xmlns": "http://tempuri.org/",//NOSONAR
                        HandlingStation: "",
                        HouseBill: get(data, "housebill", ""),
                        TrackingNotes: {
                            TrackingNotes: {
                                TrackingNoteMessage: `Latitude=${get(data, "latitude", "")} Longitude=${get(data, "longitude", "")}`,
                            }
                        }
                    }
                }
            }
        });
    }else if (get(data, "statusCode", "") === "OTH") {
        xml = convert({
            "soap:Envelope": {
              "@xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
              "@xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
              "@xmlns:soap": "http://schemas.xmlsoap.org/soap/envelope/",
              "soap:Header": {
                "AuthHeader": {
                  "@xmlns": "http://tempuri.org/",//NOSONAR
                  "UserName": wt_soap_username,
                  "Password": wt_soap_password
                }
              },
              "soap:Body": {
                "WriteTrackingNote": {
                  "@xmlns": "http://tempuri.org/",//NOSONAR
                  HandlingStation: "",
                  HouseBill: get(data, "housebill", ""),
                  TrackingNotes: {
                    TrackingNotes: {
                      TrackingNoteMessage: get(data, "note", "")
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
                        UserName: wt_soap_username,
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

        const config = {
            method: 'post',
            headers: {
                'Accept': 'text/xml',
                'Content-Type': 'text/xml'
            },
            data: postData
        };

        if (get(itemObj, "statusCode", "") === "DEL") {
            config.url = `${process.env.ADD_MILESTONE_URL}?op=SubmitPOD`;
        } else if (get(itemObj, "statusCode", "") === "LOC" || get(itemObj, "statusCode", "") === "OTH") {
            config.url = `${process.env.ADD_MILESTONE_LOC_URL}?op=WriteTrackingNote`;
        } else {
            config.url = `${process.env.ADD_MILESTONE_URL}?op=UpdateStatus`;
        }

        console.log("config: ", config)
        const res = await axios.request(config);
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
                message: message === "true" || "Success" ? "success" : "failed",
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

async function sendsns(error) {
    const params = {
        Message: `An error occurred in function ${functionName}. Error details: ${error}.`,
        TopicArn: process.env.ERROR_SNS_ARN,
    };
    try{
    await sns.publish(params).promise();
    }catch(error){
        console.error("Error while sending sns notification: ", error)
    }
}