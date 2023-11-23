const AWS = require("aws-sdk");
const Joi = require("joi");
const axios = require("axios");
const { convert } = require("xmlbuilder2");
const { get } = require("lodash");
const moment = require("moment");
const { v4: uuidv4 } = require("uuid");
const { log, logUtilization } = require("../../src/shared/logger");

const eventValidation = Joi.object().keys({
  shipperZip: Joi.string().required(),
  consigneeZip: Joi.string().required(),
  pickupTime: Joi.date().iso().greater("now").required(),
  customerNumber: Joi.number().integer().max(999999),
  shipmentLines: Joi.array()
    .items(
      Joi.object({
        pieces: Joi.number().integer().required(),
        pieceType: Joi.any(),
        weight: Joi.number().integer().max(99999).required(),
        length: Joi.number().integer().max(999).required(),
        width: Joi.number().integer().max(999).required(),
        height: Joi.number().integer().max(999).required(),
        hazmat: Joi.any(),
        dimUOM: Joi.string()
          .valid("in", "In", "IN", "cm", "Cm", "CM")
          .required(),
        weightUOM: Joi.string()
          .valid("kg", "Kg", "KG", "lb", "Lb", "LB")
          .required(),
      })
    )
    .required(),
});

function isArray(a) {
  return !!a && a.constructor === Array;
}
const correlationId = uuidv4();

module.exports.handler = async (event, context, callback) => {
  console.log("Event", JSON.stringify(event));
  if (event.source === "serverless-plugin-warmup") {
    console.log("WarmUp - Lambda is warm!");
    return "Lambda is warm!";
  }
  log(correlationId, JSON.stringify(event), 200);
  const { body } = event;
  const apiKey = get(event,`headers["x-api-key"]`, "");
  console.log("apiKey", apiKey);

  let reqFields = {};
  let valError;
  let newJSON = {
    RatingInput: {},
    CommodityInput: {
      CommodityInput: {},
    },
  };
  let customerNumber;

  if (get(event, `enhancedAuthContext.customerId`, "") != "customer-portal-admin") {
    customerNumber = await getCustomerNumber(apiKey);
    console.log("customerNumber", customerNumber);
    if (customerNumber == "failure") {
      return callback(
        response(
          "[400]",
          "Customer Information does not exist. Please raise a support ticket to add the customer"
        )
      );
    } else {
      customerNumber = get(customerNumber,"BillToAcct", "");
    }
  } else {
    customerNumber = get(body,"shipmentRateRequest.customerNumber", "");
  }
  console.log("customerNumber===>", customerNumber);
  await logUtilization(customerNumber);

  newJSON.RatingInput.BillToNo = customerNumber;
  log(correlationId, JSON.stringify(newJSON), 200);

  // return {};
  if (
    !("enhancedAuthContext" in event) ||
    !("customerId" in get(event,"enhancedAuthContext", ""))
  ) {
    valError = "CustomerId not found.";
  } else if (!("shipmentRateRequest" in body)) {
    valError = "shipmentRateRequest is required.";
  } else if (
    !("shipperZip" in get(body,"shipmentRateRequest", "")) ||
    !("consigneeZip" in get(body,"shipmentRateRequest", "")) ||
    !("pickupTime" in get(body,"shipmentRateRequest", ""))
  ) {
    valError =
      "shipperZip, consigneeZip, and pickupTime are required fields. Please ensure you are sending all 3 of these values.";
  } else if (
    !Number.isInteger(Number(get(body,"shipmentRateRequest.shipperZip", ""))) ||
    !Number.isInteger(Number(get(body,"shipmentRateRequest.consigneeZip", "")))
  ) {
    valError = "Invalid zip value.";
  } else if (
    event.enhancedAuthContext.customerId == "customer-portal-admin" &&
    !("customerNumber" in get(body,"shipmentRateRequest", ""))
  ) {
    valError = "customerNumber is a required field for this request.";
  } else if (
    !("shipmentLines" in get(body,"shipmentRateRequest", "")) ||
    get(body, `shipmentRateRequest.shipmentLines.length`, "") <= 0
  ) {
    valError = "At least 1 shipmentLine is required for this request.";
  } else {
    reqFields.shipperZip = get(body, "shipmentRateRequest.shipperZip", "");
    reqFields.consigneeZip = get(body, "shipmentRateRequest.consigneeZip", "");
    reqFields.pickupTime = get(body, `shipmentRateRequest.pickupTime`, "").replace(
      "Z",
      "+00:00"
    );
    reqFields.shipmentLines = [];

    for (let i = 0; i < get(body, "shipmentRateRequest.shipmentLines.length", 0); i++) {
      reqFields.shipmentLines.push({});
      for (let key in get(body, `shipmentRateRequest.shipmentLines[${i}]`)) {
        if (!key.includes("//")) {
          reqFields.shipmentLines[i][key] =
            get(body, `shipmentRateRequest.shipmentLines[${i}][${key}]`);
        }
      }
    }
  }

  const { error, value } = eventValidation.validate(reqFields);

  if (valError) {
    log(correlationId, JSON.stringify(valError), 200);
    return callback(response("[400]", valError));
  } else if (error) {
    let key = get(error, `details[0].context.key`, "");
    log(correlationId, JSON.stringify(error), 200);
    if (error.toString().includes("shipmentLines")) {
      return callback(
        response(
          "[400]",
          "shipmentLines." + key + get(error, `details[0].message`, "").split('"')[2]
        )
      );
    } else {
      return callback(response("[400]", key + " " + error));
    }
  } else {
    newJSON.RatingInput.OriginZip = get(reqFields, `shipperZip`, "");
    newJSON.RatingInput.DestinationZip = get(reqFields, `consigneeZip`, "");
    newJSON.RatingInput.PickupTime = get(reqFields,`pickupTime`, "").toString();
    newJSON.RatingInput.PickupDate = get(reqFields, `pickupTime`, "").toString();
    newJSON.RatingInput.PickupLocationCloseTime =
      get(reqFields, `pickupTime`, "").toString();
  }

  newJSON.RatingInput.RequestID = 20221104;

  log(correlationId, JSON.stringify(newJSON), 200);
  if ("insuredValue" in get(body, `shipmentRateRequest`, "")) {
    try {
      if (
        Number(get(body, `shipmentRateRequest.insuredValue`, 0)) > 0 &&
        Number(get(body, `shipmentRateRequest.insuredValue`, 0)) <=
          9999999999999999999999999999n
      ) {
        newJSON.RatingInput.LiabilityType = "INSP";
        // newJSON.RatingInput.DeclaredValue = Number
        //   body.shipmentRateRequest.insuredValue.toLocaleString("fullwide", {
        //     useGrouping: false,
        //   });
        newJSON.RatingInput.DeclaredValue = Number(
          get(body, `shipmentRateRequest.insuredValue`, "")
        );
      } else {
        newJSON.RatingInput.LiabilityType = "LL";
      }
    } catch {
      newJSON.RatingInput.LiabilityType = "LL";
    }
  }

  if (
    "commodityClass" in body.shipmentRateRequest &&
    Number(body.shipmentRateRequest.commodityClass) != NaN
  ) {
    newJSON.RatingInput.CommodityClass = Number(
      body.shipmentRateRequest.commodityClass
    );
  }

  if (
    "commodityClass" in body.shipmentRateRequest &&
    Number(body.shipmentRateRequest.commodityClass) != NaN
  ) {
    newJSON.RatingInput.CommodityClass = Number(
      body.shipmentRateRequest.commodityClass
    );
  }

  log(correlationId, JSON.stringify(newJSON), 200);
  try {
    newJSON.CommodityInput = addCommodityWeightPerPiece(get(body, `shipmentRateRequest`, ""));
    log(correlationId, JSON.stringify(newJSON), 200);
    // newJSON.CommodityInput = addCommodityWeightPerPiece(
    //   body.shipmentRateRequest
    // );
    if ("accessorialList" in body.shipmentRateRequest) {
      newJSON.AccessorialInput = {};
      newJSON.AccessorialInput.AccessorialInput = [];
      for (
        let x = 0;
        x < get(body, `shipmentRateRequest.accessorialList.length`, 0);
        x++
      ) {
        newJSON.AccessorialInput.AccessorialInput.push({ AccessorialCode: get(body, `shipmentRateRequest.accessorialList[${x}]`)});
      }
    }

    console.log("newJSON", JSON.stringify(newJSON));
    // return {};
    log(correlationId, JSON.stringify(get(newJSON, `AccessorialInput`, "")), 200);
    const postData = makeJsonToXml(newJSON);
    console.log("postData", postData);
    log(correlationId, JSON.stringify(postData), 200);
    const dataResponse = await getRating(postData);
    log(correlationId, JSON.stringify(dataResponse), 200);
    const dataObj = {};
    dataObj.shipmentRateResponse = makeXmlToJson(dataResponse);
    console.log("dataObj====>", dataObj);

    if ("Error" in get(dataObj, `shipmentRateResponse`, "")) {
      return callback(response("[400]", get(dataObj, `shipmentRateResponse.Error`, "")));
    } else {
      for (let m = 0; m < get(dataObj, `shipmentRateResponse.length`, 0); m++) {
        if (
          typeof dataObj.shipmentRateResponse[m].accessorialList == "string"
        ) {
          dataObj.shipmentRateResponse[m].accessorialList = [];
        }
      }
      return dataObj;
    }
  } catch (error) {
    console.log(error)
    return callback(
      response(
        "[400]",
        error ?? get(error, `message`, error)
      )
    );
  }
};

function addCommodityWeightPerPiece(inputData) {
  let shipmentLinesArray = [];
  for (let shipmentLine of get(inputData, `shipmentLines`, [])) {
    let obj = {
      CommodityInput: {},
    };
    if (shipmentLine.dimUOM.toLowerCase() == "cm") {
      shipmentLine.length = Math.round(get(shipmentLine, `length`, 0) * 0.393701);
      shipmentLine.width = Math.round(get(shipmentLine, `width`, 0) * 0.393701);
      shipmentLine.height = Math.round(get(shipmentLine, `height`, 0) * 0.393701);
    }
    if (shipmentLine.weightUOM.toLowerCase() == "kg") {
      shipmentLine.weightPerPiece = Math.round(
        (get(shipmentLine, `weight`, 0) * 2.2046) / get(shipmentLine, `pieces`, 1)
      );
    } else {
      shipmentLine.weightPerPiece = Math.round(
        get(shipmentLine, `weight`, 0) / get(shipmentLine, `pieces`, 1)
      );
    }
    log(correlationId, JSON.stringify(shipmentLine), 200);
    for (const shipKey in shipmentLine) {
      if (shipKey.includes("//")) {
        continue;
      }
      if (shipKey == "hazmat") {
        obj.CommodityInput.CommodityHazmat = get(shipmentLine, `hazmat`, "")
          ? "Y"
          : "N";
      } else if (shipKey != "dimUOM" && shipKey != "weightUOM") {
        new_key =
          "Commodity" + shipKey.charAt(0).toUpperCase() + shipKey.slice(1);
        obj.CommodityInput[new_key] = get(shipmentLine, shipKey, "");
      }
    }
    shipmentLinesArray.push(obj);
  }
  return shipmentLinesArray;
}

function makeJsonToXml(data) {
  return convert({
    "soap12:Envelope": {
      "@xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
      "@xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
      "@xmlns:soap12": "http://www.w3.org/2003/05/soap-envelope",
      "soap12:Body": {
        GetRatingByCustomer: {
          "@xmlns": "http://tempuri.org/",
          RatingParam:  data,
        },
      },
    },
  });
}

function makeXmlToJson(data) {
  try {
    let obj = convert(data, { format: "object" });
    log(correlationId, JSON.stringify(obj), 200);
    if (
      get(obj, `soap:Envelope.soap:Body.GetRatingByCustomerResponse.GetRatingByCustomerResult`, "").hasOwnProperty(
        "RatingOutput"
      )
    ) {
      const modifiedObj =
        get(obj, `soap:Envelope.soap:Body.GetRatingByCustomerResponse.GetRatingByCustomerResult.RatingOutput`, "");
      log(correlationId, JSON.stringify(modifiedObj), 200);
      if (isArray(modifiedObj)) {
        console.info("isArray");
        return modifiedObj.map((e) => {
          log(correlationId, JSON.stringify(get(e, `AccessorialOutput`, "")), 200);
          if (isEmpty(get(e, `Message`, ""))) {
            e.Message = "";
          }
          let AccessorialOutput = null;
          if (
            get(e, `AccessorialOutput`, null) !== null &&
            get(e, `AccessorialOutput.AccessorialOutput`, null) !== null &&
            get(e, `AccessorialOutput.AccessorialOutput[0]`, "") == null
          ) {
            AccessorialOutput = getAccessorialOutput(e.AccessorialOutput);
          } else if (get(e, `AccessorialOutput.AccessorialOutput`, null) !== null) {
              AccessorialOutput = getAccessorialOutput(get(e, `AccessorialOutput`, null));
          }
          let EstimatedDelivery;
          if (get(e, `DeliveryTime`, null) !== null && get(e, `DeliveryTime`, null) != null) {
            // EstimatedDelivery = new Date(modifiedObj.DeliveryDate);
            console.info("EstimatedDelivery-----");
            //----------------------------------------------------------------
            const dateStr = JSON.stringify(
              get(e, `DeliveryDate`, "") + " " + get(e, `DeliveryTime`, "")
            );
            const dateObj = moment(dateStr, "M/D/YYYY h:mm:ssA");
            const deliveryStr = dateObj.format("YYYY-MM-DDTHH:mm:ss");
            EstimatedDelivery = deliveryStr;
            //----------------------------------------------------------------
          }
          if (
            get(e, `ServiceLevelID.length`, undefined) == undefined &&
            get(e, `DeliveryTime.length`, undefined) == undefined &&
            get(e, `Message`, "") != null
          ) {
            return { Error: e.Message };
          }
          log(correlationId, JSON.stringify(EstimatedDelivery), 200);
          return {
            serviceLevel: get(e, `ServiceLevelID`, ""),
            estimatedDelivery:
              e.DeliveryDate == "1/1/1900" ? "" : EstimatedDelivery,
            totalRate: parseFloat(get(e, `StandardTotalRate`, "").replace(/,/g, "")),
            freightCharge: parseFloat(
              get(e, `StandardFreightCharge`, "").replace(/,/g, "")
            ),
            accessorialList: AccessorialOutput == null ? "" : AccessorialOutput,
            message: get(e, `Message`, ""),
          };
        });
      } else {
        console.info("object");
        if (isEmpty(get(modifiedObj, `Message`, ""))) {
          modifiedObj.Message = "";
        }
        let AccessorialOutput = null;
        if (
          get(modifiedObj, `AccessorialOutput`, null) !== null &&
          get(modifiedObj, `AccessorialOutput.AccessorialOutput`, null) !== null &&
          get(modifiedObj, `AccessorialOutput.AccessorialOutput[0]`, "") == null
        ) {
          const list = [];
          for (
            let i = 0;
            i < get(modifiedObj,`AccessorialOutput.AccessorialOutput.length`, 0);
            i++
          ) {
            list[i] = {};
            get(modifiedObj, `AccessorialOutput.AccessorialOutput[${i}].AccessorialCode`, null)
              ? (list[i].code =
                  get(modifiedObj, `AccessorialOutput.AccessorialOutput[
                    ${i}
                  ].AccessorialCode`, ""))
              : get(modifiedObj, `AccessorialOutput.AccessorialOutput[${i}]
                  .AccessorialDesc`, "")
              ? (list[i].description =
                  get(modifiedObj, `AccessorialOutput.AccessorialOutput[
                    ${i}
                  ].AccessorialDesc`))
              : get(modifiedObj, `AccessorialOutput.AccessorialOutput[${i}]
                  .AccessorialCharge`, "")
              ? (list[i].charge = parseFloat(
                  get(modifiedObj, `AccessorialOutput.AccessorialOutput[
                    ${i}
                  ].AccessorialCharge`).replace(/,/g, "")
                ))
              : console.info("no charge");
          }
          AccessorialOutput = list;
        } else {
          const list = [];
          if (get(modifiedObj, `AccessorialOutput.AccessorialOutput`, null) !== null) {
            for (
              let i = 0;
              i < get(modifiedObj, `AccessorialOutput.AccessorialOutput.length`, 0);
              i++
            ) {
              list[i] = {};
              list[i].code =
                get(modifiedObj, `AccessorialOutput.AccessorialOutput[
                  ${i}
                ].AccessorialCode`, "");
              list[i].description =
                get(modifiedObj, `AccessorialOutput.AccessorialOutput[
                  ${i}
                ].AccessorialDesc`, "");
              list[i].charge = parseFloat(
                get(modifiedObj, `AccessorialOutput.AccessorialOutput[
                  ${i}
                ].AccessorialCharge`, "").replace(/,/g, "")
              );
            }
            AccessorialOutput = list;
          }
        }
        let EstimatedDelivery;
        if (get(modifiedObj, `DeliveryTime`, null) !== null && get(modifiedObj, `DeliveryTime`, "") != null) {
          // EstimatedDelivery = new Date(modifiedObj.DeliveryDate);
          console.info("EstimatedDelivery=========>");
          //----------------------------------------------------------------
          const dateStr = JSON.stringify(
            get(modifiedObj, `DeliveryDate`, "") + " " + get(modifiedObj, `DeliveryTime`, "")
          );
          const dateObj = moment(dateStr, "M/D/YYYY h:mm:ssA");
          const deliveryStr = dateObj.format("YYYY-MM-DDTHH:mm:ss");
          EstimatedDelivery = deliveryStr;
          //----------------------------------------------------------------
        }

        if (
          get(modifiedObj, `ServiceLevelID.length`, undefined) == undefined &&
          get(modifiedObj, `DeliveryTime.length`, undefined) == undefined &&
          get(modifiedObj, `Message`, "") != null
        ) {
          return { Error: get(modifiedObj, `Message`, "") };
        } else {
          return [
            {
              serviceLevel: get(modifiedObj, `ServiceLevelID`, ""),
              estimatedDelivery:
                get(modifiedObj, `DeliveryDate`, "") == "1/1/1900" ? "" : EstimatedDelivery,
              totalRate: parseFloat(
                get(modifiedObj, `StandardTotalRate`, "").replace(/,/g, "")
              ),
              freightCharge: parseFloat(
                get(modifiedObj, `StandardFreightCharge`, "").replace(/,/g, "")
              ),
              accessorialList:
                AccessorialOutput == null ? "" : AccessorialOutput,
              message: get(modifiedObj, `Message`, ""),
            },
          ];
        }
      }
    } else {
      throw "Rate not found.";
    }
  } catch (e) {
    throw get(e, `message`, e);
  }
}

function getAccessorialOutput(AccessorialOutput) {
  let list = [];
  if (Array.isArray(get(AccessorialOutput, `AccessorialOutput`, ""))) {
    if (get(AccessorialOutput, `AccessorialOutput`, "")) {
      for (let i = 0; i < get(AccessorialOutput, `AccessorialOutput.length`, ""); i++) {
        list[i] = {};
        list[i].code = get(AccessorialOutput, `AccessorialOutput[${i}].AccessorialCode`, "");
        list[i].description =
          get(AccessorialOutput, `AccessorialOutput[${i}].AccessorialDesc`, "");
        list[i].charge = parseFloat(
          get(AccessorialOutput, `AccessorialOutput[${i}].AccessorialCharge`, "").replace(
            /,/g,
            ""
          )
        );
      }
    }
  } else {
    let i = 0;
    list[i] = {};
    list[i].code = get(AccessorialOutput, `AccessorialOutput.AccessorialCode`, "");
    list[i].description = get(AccessorialOutput, `AccessorialOutput.AccessorialDesc`, "");
    list[i].charge = parseFloat(
      get(AccessorialOutput, `AccessorialOutput.AccessorialCharge`, "").replace(/,/g, "")
    );
  }
  return list;
}

function isEmpty(obj) {
  return Object.keys(obj).length === 0;
}

function response(code, message) {
  return JSON.stringify({
    httpStatus: code,
    message,
  });
}

async function getCustomerId(customerId) {
  try {
    const documentClient = new AWS.DynamoDB.DocumentClient({
      region: process.env.REGION,
      functionName: process.env.FUNCTION_NAME,
    });
    const params = {
      TableName: process.env.ACCOUNT_INFO_TABLE,
      IndexName: process.env.ACCOUNT_INFO_TABLE_INDEX,
      KeyConditionExpression: "CustomerID = :CustomerID",
      ExpressionAttributeValues: { ":CustomerID": customerId },
    };
    const response = await documentClient.query(params).promise();
    if (get(response, `Items.length`, 0) > 0) {
      log(correlationId, JSON.stringify(get(response, `Items`, "")), 200);
      return get(response, `Items[0]`, "");
    } else {
      return "failure";
    }
  } catch (e) {
    throw e.hasOwnProperty("message") ? get(e, `message`, "") : e;
  }
}

async function getRating(postData) {
  try {
    const res = await axios.post(process.env.RATING_API, postData, {
      headers: {
        Accept: "text/xml",
        "Content-Type": "text/xml; charset=utf-8",
      },
    });
    if (res.status == 200) {
      return res.data;
    } else {
      throw get(e, `response.statusText`, "");
    }
  } catch (e) {
    let obj = convert(get(e, `response.data`, ""), { format: "object" });
    let errorMessage =
      get(obj, `soap:Envelope.soap:Body.soap:Fault.soap:Reason.soap:Text.#`, "");
    log(correlationId, JSON.stringify(get(e, `response`, "")), 200);
    throw e.hasOwnProperty("response") ? errorMessage : e;
  }
}

async function getCustomerNumber(xApiKey) {
  try {
    const documentClient = new AWS.DynamoDB.DocumentClient({
      region: process.env.REGION,
      functionName: process.env.FUNCTION_NAME,
    });
    const validatorParams = {
      TableName: process.env.TOKEN_VALIDATOR_TABLE,
      IndexName: "ApiKey-index",
      KeyConditionExpression: "ApiKey = :val",
      ExpressionAttributeValues: {
        ":val": xApiKey,
      },
    };
    const validatorResp = await documentClient.query(validatorParams).promise();
    console.log("validatorResp", validatorResp);

    if (get(validatorResp, `Items`, null) !== null && get(validatorResp, `Items.length`, 0) > 0) {
      log(correlationId, JSON.stringify(get(validatorResp, `Items`, "")), 200);
      const customerId = get(validatorResp, `Items[0].CustomerID`, "");
      const response = await getCustomerId(customerId);
      console.log("CustomerIdResponse", response);
      if (Object.keys(response).length > 0) {
        log(correlationId, JSON.stringify(get(response, `Items`, "")), 200);
        return response;
      } else {
        return "failure";
      }
    } else {
      return callback(response("[400]", "No response from Validator Table"));
    }
  } catch (e) {
    throw e.hasOwnProperty("message") ? get(e, `message`, "") : e;
  }
}
