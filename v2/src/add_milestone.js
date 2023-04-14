const axios = require("axios");
const { convert } = require("xmlbuilder2");

module.exports.handler = async (event, context, callback) => {
  console.info("event", JSON.stringify(event));

  const { body } = event;

  console.log("body", body);

  if (body.addMilestoneRequest.statusCode == "CAN") {
    return await sendEvent(body, callback);
  } else {
    return callback(response("[400]", "Milestone event is not accepted"));
  }
};
//*******************************************************************//

/**
 * send the event data to the addMilestone api
 * @param {*} value
 * @param {*} callback
 * @returns
 */
async function sendEvent(value, callback) {
  const addMilestoneData = value.addMilestoneRequest;
  const eventBody = {
    ...addMilestoneData,
    eventTime: addMilestoneData.eventTime.replace("Z", "+00:00"),
  };

  try {
    const postData = makeJsonToXml(eventBody);
    console.log("postData", postData);

    const dataResponse = await addMilestoneApi(postData);
    console.log("dataResponse", dataResponse);

    const dataObj = makeXmlToJson(dataResponse, eventBody.statusCode);
    console.log("dataObj", dataObj);

    if (dataObj.addMilestoneResponse.message === "success") {
      return dataObj;
    } else {
      return callback(response("[400]", "failed"));
    }
  } catch (error) {
    return callback(
      response(
        "[500]",
        error != null && error.hasOwnProperty("message") ? error.message : error
      )
    );
  }
}

/**
 * depending on staus_code create a xml_payload form json
 * @param {*} data
 * @returns
 */
function makeJsonToXml(data) {
  let xml = "";
  if (data.statusCode === "DEL") {
    xml = convert({
      "soap:Envelope": {
        "@xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
        "@xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
        "@xmlns:soap": "http://schemas.xmlsoap.org/soap/envelope/",
        "soap:Body": {
          SubmitPOD: {
            "@xmlns": "http://tempuri.org/",
            HAWB: data.houseBill,
            UserName: "BIZCLOUD",
            UserInitials: "BIZCLOUD",
            Signer: data.signatory,
            PODDateTime: data.eventTime,
            LatLon: data.latitude + "," + data.longitude,
          },
        },
      },
    });
  } else {
    xml = convert({
      "soap:Envelope": {
        "@xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
        "@xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
        "@xmlns:soap": "http://schemas.xmlsoap.org/soap/envelope/",
        "soap:Body": {
          UpdateStatus: {
            "@xmlns": "http://tempuri.org/",
            HandlingStation: "",
            HAWB: data.houseBill,
            UserName: "BIZCLOUD",
            StatusCode: data.statusCode,
            EventDateTime: data.eventTime,
          },
        },
      },
    });
  }
  console.info("xml payload", xml);
  return xml;
}

/**
 * depending on the stausCode convert Xml to json
 * @param {*} data
 * @param {*} statusCode
 * @returns
 */
function makeXmlToJson(data, statusCode) {
  try {
    let obj = convert(data, { format: "object" });
    console.log("obj:makeXmlToJson", JSON.stringify(obj));
    let message = "failed";
    if (statusCode === "DEL") {
      message =
        obj["soap:Envelope"]["soap:Body"].SubmitPODResponse.SubmitPODResult;
    } else {
      message =
        obj["soap:Envelope"]["soap:Body"].UpdateStatusResponse
          .UpdateStatusResult;
    }
    return {
      addMilestoneResponse: {
        message: message === "true" ? "success" : "failed",
      },
    };
  } catch (e) {
    console.log("e:makeXmlToJson", e);
    throw "Unable to convert xml to json";
  }
}

/**
 * return response
 * @param {*} code
 * @param {*} message
 * @returns
 */
function response(code, message) {
  return JSON.stringify({
    httpStatus: code,
    message,
  });
}

/**
 * send postData to the ADD_MILESTONE_URL api
 * @param {*} postData
 * @returns
 */
async function addMilestoneApi(postData) {
  try {
    const res = await axios.post(process.env.ADD_MILESTONE_URL, postData, {
      headers: {
        Accept: "text/xml",
        "Content-Type": "text/xml",
      },
    });
    if (res.status == 200) {
      return res.data;
    } else {
      throw "Request Failed";
    }
  } catch (e) {
    console.log("e:addMilestoneApi", e);
    throw "Request Failed";
  }
}
