const AWS = require("aws-sdk");
const Joi = require("joi");
const axios = require("axios");
const { convert } = require("xmlbuilder2");
const pgp = require("pg-promise");

module.exports.handler = async (event, context, callback) => {
  try {
    const dbUser = process.env.USER;
    const dbPassword = process.env.PASS;
    // const dbHost = process.env.HOST;
    const dbHost = "omni-dw-prod.cnimhrgrtodg.us-east-1.redshift.amazonaws.com"; //process.env.HOST;
    const dbPort = process.env.PORT;
    const dbName = process.env.DBNAME;

    const dbc = pgp({ capSQL: true });
    console.log(`Opening connection to: ${dbName}, host is: ${dbHost}`);

    const connectionString = `postgres://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;
    const connections = dbc(connectionString);
    // console.log("connections", connections);
    const query = `select
    a.file_nbr ,a.house_bill_nbr ,a.handling_stn ,a.controlling_stn ,a.chrg_wght_lbs ,a.chrg_wght_kgs ,
    case b.order_status
    when 'PUP' then 'AF'
    when 'AAP' then 'AV / X1'
    when 'DPO' then 'CD'
    when 'COB' then 'AN'
    when 'DEL'then 'D1'
    end order_Status,
    case b.order_status
    when 'PUP' then 'Pick Up Confirmed'
    when 'AAP' then 'Actual Arrival at Destination Port'
    when 'DPO' then 'Actual departure Destination Port'
    when 'COB' then 'Confirmed On Board'
    when 'DEL'then 'Delivered - No Exception'
    end order_Status_Desc,
    b.order_status_desc ,b.event_date_utc ,c.ref_nbr
    from
    shipment_info a
    left outer join shipment_milestone b
    on a.file_nbr = b.file_nbr
    and a.source_system = b.source_system
    left outer join shipment_ref c
    on a.source_system = c.source_system
    and a.file_nbr = c.file_nbr
    and c.ref_typeid = 'SID'
    where a.bill_to_nbr = '17833'`;

    const result = await connections.query(query);
    console.log("result", result);
    // const demoResult = [
    //   {
    //     file_nbr: "3661515",
    //     house_bill_nbr: "3651511",
    //     handling_stn: "LAX",
    //     controlling_stn: "LGB",
    //     chrg_wght_lbs: "192.00",
    //     chrg_wght_kgs: "87.50",
    //     order_status: null,
    //     order_status_desc: null,
    //     event_date_utc: null,
    //     ref_nbr: null,
    //   },
    // ];
    return {};
  } catch (error) {
    return callback(
      response(
        "[500]",
        error != null && error.hasOwnProperty("message") ? error.message : error
      )
    );
  }
};

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
  try {
    let obj = convert(data, { format: "object" });
    if (
      obj["soap:Envelope"][
        "soap:Body"
      ].GetRatingResponse.GetRatingResult.hasOwnProperty("RatingOutput")
    ) {
      const modifiedObj =
        obj["soap:Envelope"]["soap:Body"].GetRatingResponse.GetRatingResult
          .RatingOutput;
      console.log("modifiedObj", modifiedObj);

      if (isArray(modifiedObj)) {
        return modifiedObj.map((e) => {
          if (isEmpty(e.Message)) {
            e.Message = "";
          }
          let AccessorialOutput = null;
          if (
            e.AccessorialOutput &&
            e.AccessorialOutput.AccessorialOutput &&
            e.AccessorialOutput.AccessorialOutput[0] == null
          ) {
            const list = [];
            list.push(e.AccessorialOutput.AccessorialOutput);
            AccessorialOutput = list;
          } else {
            AccessorialOutput = e.AccessorialOutput.AccessorialOutput;
          }

          return {
            ServiceLevelID: e.ServiceLevelID,
            StandardTotalRate: e.StandardTotalRate,
            StandardFreightCharge: e.StandardFreightCharge,
            AccessorialOutput:
              AccessorialOutput == null ? "" : AccessorialOutput,
            Message: e.Message,
          };
        });
      } else {
        if (isEmpty(modifiedObj.Message)) {
          modifiedObj.Message = "";
        } else if (modifiedObj.Message.search("WebTrakUserID") != -1) {
          throw "Internal error message";
        }
        let AccessorialOutput = null;
        if (
          modifiedObj.AccessorialOutput &&
          modifiedObj.AccessorialOutput.AccessorialOutput &&
          modifiedObj.AccessorialOutput.AccessorialOutput[0] == null
        ) {
          const list = [];
          list.push(modifiedObj.AccessorialOutput.AccessorialOutput);
          AccessorialOutput = list;
        } else {
          AccessorialOutput = modifiedObj.AccessorialOutput.AccessorialOutput;
        }
        return [
          {
            ServiceLevelID: modifiedObj.ServiceLevelID,
            StandardTotalRate: modifiedObj.StandardTotalRate,
            Message: modifiedObj.Message,
            StandardFreightCharge: modifiedObj.hasOwnProperty(
              "StandardFreightCharge"
            )
              ? modifiedObj.StandardFreightCharge
              : "",
            AccessorialOutput:
              AccessorialOutput == null ? "" : AccessorialOutput,
          },
        ];
      }
    } else {
      throw "Rate not found.";
    }
  } catch (e) {
    throw e.hasOwnProperty("message") ? e.message : e;
  }
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
      throw e.response.statusText;
    }
  } catch (e) {
    throw e.hasOwnProperty("response") ? "Request failed" : e;
  }
}
