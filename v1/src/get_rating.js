const AWS = require("aws-sdk");
const Joi = require("joi");
const axios = require("axios");
const { convert } = require("xmlbuilder2");

// const replaceNull = Joi.allow(null).empty("").default(null).required();
const CommodityInputValidation = {
  CommodityPieces: Joi.number().integer().required(),
  CommodityWeightLB: Joi.number().integer().required(),
  CommodityLengthIN: Joi.number().integer().required(),
  CommodityWidthIN: Joi.number().integer().required(),
  CommodityHeightIN: Joi.number().integer().required(),
};
const eventValidation = Joi.object().keys({
  RatingInput: Joi.object()
    .keys({
      OriginZip: Joi.string().alphanum().required(),
      DestinationZip: Joi.string().alphanum().required(),
      PickupTime: Joi.date().iso().greater("now").required(),
    })
    .required(),
  CommodityInput: Joi.object()
    .keys({
      CommodityInput: Joi.alternatives(
        Joi.object().keys(CommodityInputValidation),
        Joi.array().items(CommodityInputValidation)
      ).required(),
    })
    .required(),
});

function isArray(a) {
  return !!a && a.constructor === Array;
}

module.exports.handler = async (event, context, callback) => {
  const body = !event.body ? null : JSON.parse(event.body);
  const LiabilityType = "LL";

  if (!event.headers.hasOwnProperty("x-api-key")) {
    return callback(null, errorMsg(400, "Invalid API Key"));
  }
  const apiKey = event.headers["x-api-key"];

  const { error, value } = eventValidation.validate(body);
  if (error) {
    let msg = error.details[0].message
      .split('" ')[1]
      .replace(new RegExp('"', "g"), "");
    let key = error.details[0].context.key;
    return callback(null, errorMsg(400, key + " " + msg));
  }
  const eventBody = value;
  const PickupTime = body.RatingInput.PickupTime.toString();

  eventBody.RatingInput.LiabilityType = LiabilityType;
  eventBody.RatingInput.PickupDate = PickupTime;
  eventBody.RatingInput.PickupTime = PickupTime;
  eventBody.RatingInput.PickupLocationCloseTime = PickupTime;

  try {
    const customerData = await getCustomerId(apiKey);

    eventBody.RatingInput.WebTrakUserID = customerData.WebTrackId;
    const postData = makeJsonToXml(eventBody);
    const dataResponse = await getRating(postData);
    const dataObj = makeXmlToJson(dataResponse);

    if (
      dataObj.hasOwnProperty("Message") &&
      dataObj.Message == "WebTrakUserID is invalid."
    ) {
      throw "World Trak Get Rating Error";
    }
    const response = {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Credentials": "'true'",
        "Access-Control-Allow-Headers": "'*'",
      },
      body: JSON.stringify(dataObj),
    };

    return callback(null, response);
  } catch (error) {
    return callback(
      null,
      errorMsg(400, error != null ? error : "Something went wrong.")
    );
  }
};

function errorMsg(code, message) {
  return {
    statusCode: code,
    headers: {
      "Access-Control-Allow-Origin": "'*'",
      "Access-Control-Allow-Credentials": "'true'",
      "Access-Control-Allow-Headers": "'*'",
    },
    body: JSON.stringify({
      message: message,
    }),
  };
}

function makeJsonToXml(data) {
  return convert({
    "soap12:Envelope": {
      "@xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
      "@xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
      "@xmlns:soap12": "http://www.w3.org/2003/05/soap-envelope",
      "soap12:Body": {
        GetRating: {
          "@xmlns": "http://tempuri.org/",
          RatingParam: data,
        },
      },
    },
  });
}

function makeXmlToJson(data) {
  let obj = convert(data, { format: "object" });
  const modifiedObj =
    obj["soap:Envelope"]["soap:Body"].GetRatingResponse.GetRatingResult
      .RatingOutput;
  if (isArray(modifiedObj)) {
    return modifiedObj.map((e) => {
      return {
        ServiceLevelID: e.ServiceLevelID,
        StandardTotalRate: e.StandardTotalRate,
        Message: e.Message,
      };
    });
  } else {
    return [
      {
        ServiceLevelID: modifiedObj.ServiceLevelID,
        StandardTotalRate: modifiedObj.StandardTotalRate,
        Message: modifiedObj.Message,
      },
    ];
  }
}

async function getCustomerId(ApiKey) {
  try {
    const documentClient = new AWS.DynamoDB.DocumentClient({
      region: process.env.REGION,
    });
    const params = {
      TableName: process.env.TOKEN_VALIDATOR,
      FilterExpression: "#ApiKey = :ApiKey",
      ExpressionAttributeNames: { "#ApiKey": "ApiKey" },
      ExpressionAttributeValues: { ":ApiKey": ApiKey },
    };
    const response = await documentClient.scan(params).promise();
    if (response.Items && response.Items.length > 0) {
      if (
        !response.Items[0].hasOwnProperty("WebTrackId") ||
        response.Items[0].WebTrackId == null
      ) {
        throw "getCustomerId Error: No valid WebTrackId";
      }
      return response.Items[0];
    } else {
      throw "Invalid API Key";
    }
  } catch (e) {
    throw (
      "getCustomerId Error: " + (e.hasOwnProperty("message") ? e.message : e)
    );
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
      throw "getRating Error: " + e.response.statusText;
    }
  } catch (e) {
    throw (
      "getRating Error: " +
      (e.hasOwnProperty("response") ? "Request failed" : e)
    );
  }
}
