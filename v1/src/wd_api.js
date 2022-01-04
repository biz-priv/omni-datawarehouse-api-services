const AWS = require("aws-sdk");
const Joi = require("joi");
const axios = require("axios");
const { convert } = require("xmlbuilder2");
const pgp = require("pg-promise");
const payload = require("../../Helpers/wd_payload.json");
const wd_pdf = require("../../Helpers/wd_pdf.json");

module.exports.handler = async (event, context, callback) => {
  try {
    /**
     * Get data from db
     */
    const shipmentData = await getDataFromDB();

    /**
     * Check shipment data in dynamo db
     */
    const newData = await checkStatus(shipmentData);

    await Promise.all(
      newData.map(async (item) => {
        /**
         * Make Json to Xml payload
         */
        const xmlPayload = await makeJsonToXml(payload, item);
        /**
         * Get response from WD api
         */
        const xmlResponse = await getXmlResponse(xmlPayload);
        /**
         * make Xml to Json response
         */
        const refTransmissionNo = makeXmlToJson(xmlResponse);
        /**
         * Update shipment data to dynamo db
         */
        await updateStatus(item, xmlPayload, xmlResponse, refTransmissionNo);
      })
    );

    return "Completed";
  } catch (error) {
    return callback(
      response(
        "[500]",
        error != null && error.hasOwnProperty("message") ? error.message : error
      )
    );
  }
};

async function getDataFromDB(data = null) {
  try {
    const dbUser = process.env.USER;
    const dbPassword = process.env.PASS;
    const dbHost = process.env.HOST_URL;
    const dbPort = process.env.PORT;
    const dbName = process.env.WD_DBNAME;

    const dbc = pgp({ capSQL: true });
    const connectionString = `postgres://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;
    const connections = dbc(connectionString);
    const query = `select distinct
    a.file_nbr ,a.house_bill_nbr ,
    a.handling_stn ,a.controlling_stn ,a.chrg_wght_lbs ,a.chrg_wght_kgs ,pieces,
    case b.order_status
    when 'PUP' then 'AF'
    when 'COB' then 'AN'
    when 'DEL'then 'D1'
    else order_Status
    end order_Status,
    case b.order_status
    when 'PUP' then 'Pick Up Confirmed'
    when 'COB' then 'Confirmed On Board'
    when 'DEL'then 'Delivered - No Exception'
    else order_Status_desc
    end order_Status_Desc,
    case when b.order_status in ('PUP','COB','DEL') then b.event_date_utc else null end as Event_Date_utc,
    case when b.order_status in ('PUP','COB') then A.ORIGIN_PORT_IATA
    when b.order_status in ('DEL') then A.DESTINATION_PORT_IATA
    else '' end as event_city,
    case when b.order_status in ('PUP','COB','DEL') then  'US' else '' end as Event_country,
    c.ref_nbr
        from
        shipment_info a
        left outer join shipment_milestone b
        on a.file_nbr = b.file_nbr
        and a.source_system = b.source_system
        left outer join
        (select distinct source_system ,file_nbr ,ref_nbr from shipment_ref where ref_typeid = 'REF') c
        on a.source_system = c.source_system
        and a.file_nbr = c.file_nbr
        where a.bill_to_nbr = '17833'
        and b.order_status in ('PUP','COB','DEL','POD')`;

    const result = await connections.query(query);
    if (!result || result.length == 0) {
      throw "No data found.";
    }
    return result;
  } catch (error) {
    throw "No data found.";
  }
}

async function checkStatus(shipmentData) {
  try {
    const documentClient = new AWS.DynamoDB.DocumentClient({
      region: process.env.REGION,
    });
    let idList = {};
    shipmentData.map((e, i) => {
      idList[":" + i] = e.file_nbr.toString() + e.order_status;
    });
    const idMaping = Object.keys(idList);
    const params = {
      TableName: process.env.WD_SHIPMENT_STATUS_TABLE,
      FilterExpression: "#id IN (" + idMaping.join(",") + ")",
      ExpressionAttributeNames: { "#id": "id" },
      ExpressionAttributeValues: idList,
    };
    const res = await documentClient.scan(params).promise();
    let newData = [];
    if (res && res.Count != 0) {
      const oldIds = res.Items.map(
        (e) => e.file_nbr.toString() + e.order_status
      );
      newData = shipmentData.filter((e) => {
        let idKey = e.file_nbr.toString() + e.order_status;
        if (oldIds.indexOf(idKey) != -1) {
          return false;
        } else {
          return true;
        }
      });
    } else {
      newData = shipmentData;
    }
    console.info("shipment data", newData);
    return newData;
  } catch (e) {}
}

async function makeJsonToXml(payload, inputData) {
  /**
   * set auth details
   */
  payload["soapenv:Envelope"]["soapenv:Header"]["wsse:Security"][
    "wsse:UsernameToken"
  ]["wsse:Username"] = process.env.WD_API_USERNAME;
  payload["soapenv:Envelope"]["soapenv:Header"]["wsse:Security"][
    "wsse:UsernameToken"
  ]["wsse:Password"]["#"] = process.env.WD_API_PASSWORD;

  /**
   * TransmissionHeader
   */
  let transHeader =
    payload["soapenv:Envelope"]["soapenv:Body"]["tran:publish"][
      "otm:Transmission"
    ]["otm:TransmissionHeader"];
  /**
   * TransmissionBody values
   */

  let transBodyWithValues = null;

  // PUP => BOL
  // POD => POD

  if (inputData.order_status != "PUP" && inputData.order_status != "POD") {
    /**
     * without pdf
     */
    let transBody =
      payload["soapenv:Envelope"]["soapenv:Body"]["tran:publish"][
        "otm:Transmission"
      ]["otm:TransmissionBody"]["otm:GLogXMLElement"]["otm:ShipmentStatus"];
    transBody["otm:IntSavedQuery"]["otm:IntSavedQueryArg"][0]["otm:ArgValue"] =
      inputData.house_bill_nbr;

    transBody["otm:IntSavedQuery"]["otm:IntSavedQueryArg"][1]["otm:ArgValue"] =
      inputData.house_bill_nbr;

    transBody["otm:ShipmentRefnum"][0]["otm:ShipmentRefnumValue"] =
      "H" + inputData.ref_nbr;
    transBody["otm:ShipmentRefnum"][1]["otm:ShipmentRefnumValue"] =
      inputData.chrg_wght_kgs;

    transBody["otm:ShipmentRefnum"][2]["otm:ShipmentRefnumValue"] =
      inputData.pieces;
    transBody["otm:WeightVolume"]["otm:Weight"]["otm:WeightValue"] =
      inputData.chrg_wght_kgs;

    transBody["otm:EventDt"]["otm:GLogDate"] = formatDate(
      inputData.event_date_utc
    );

    transBody["otm:SSStop"]["otm:SSLocation"]["otm:EventCity"] =
      inputData.event_city;
    transBody["otm:SSStop"]["otm:SSLocation"]["otm:EventCountry"] =
      inputData.event_country;

    transBody["otm:TrackingNumber"] = "H" + inputData.ref_nbr;

    transBody["otm:ShipmentGid"]["otm:Gid"]["otm:Xid"] =
      inputData.house_bill_nbr;

    transBodyWithValues = { "otm:ShipmentStatus": null };
    transBodyWithValues["otm:ShipmentStatus"] = transBody;
  } else {
    /**
     * with pdf
     */
    wd_pdf["otm:Document"]["otm:DocumentDefinitionGid"]["otm:Gid"]["otm:Xid"] =
      inputData.order_status == "POD" ? "PROOF_OF_DELIVERY" : "BILL_OF_LADING";

    wd_pdf["otm:Document"]["otm:DocumentOwner"]["otm:ObjectGid"]["otm:Gid"][
      "otm:Xid"
    ] = inputData.house_bill_nbr;

    /**
     * get base64 pdf
     */
    const base64Pdf = await getBase64Pdf(inputData.file_nbr);
    wd_pdf["otm:Document"]["otm:DocumentContent"]["otm:DocContentBinary"] =
      base64Pdf;

    transBodyWithValues = wd_pdf;
  }

  /**
   * set the header and body data
   */
  payload["soapenv:Envelope"]["soapenv:Body"]["tran:publish"][
    "otm:Transmission"
  ]["otm:TransmissionHeader"] = transHeader;

  payload["soapenv:Envelope"]["soapenv:Body"]["tran:publish"][
    "otm:Transmission"
  ]["otm:TransmissionBody"]["otm:GLogXMLElement"] = transBodyWithValues;
  return convert(payload);
}

async function getXmlResponse(postData) {
  try {
    const res = await axios.post(process.env.WD_API, postData, {
      headers: {
        Accept: "text/xml",
        "Content-Type": "text/xml; charset=utf-8",
      },
    });
    return {
      xml_response: res.data,
      status_code: res.status,
      status: res.status == 200 ? "success" : "failed",
    };
  } catch (e) {}
}

function makeXmlToJson(xmlResponse) {
  try {
    const obj = convert(xmlResponse.xml_response, { format: "object" });
    return obj["S:Envelope"]["S:Body"]["publishResponse"][
      "otm:TransmissionAck"
    ]["otm:EchoedTransmissionHeader"]["otm:TransmissionHeader"][
      "otm:ReferenceTransmissionNo"
    ];
  } catch (error) {
    return null;
  }
}

async function updateStatus(
  record,
  xmlPayload,
  xmlResponse,
  refTransmissionNo
) {
  let documentClient = new AWS.DynamoDB.DocumentClient({
    region: process.env.DEFAULT_AWS,
  });
  const params = {
    TableName: process.env.WD_SHIPMENT_STATUS_TABLE,
    Item: {
      ...record,
      id: record.file_nbr.toString() + record.order_status,
      ReferenceTransmissionNo: refTransmissionNo,
      xml_payload: xmlPayload,
      ...xmlResponse,
      status:
        refTransmissionNo == -1 || refTransmissionNo == null
          ? "failed"
          : xmlResponse.status,
      event_date_utc: new Date(record.event_date_utc).toLocaleString(),
      created_at: new Date().toLocaleString(),
    },
  };
  try {
    await documentClient.put(params).promise();
  } catch (e) {}
}

/**
 * @param {*} file_nbr
 * @returns
 */
async function getBase64Pdf(file_nbr) {
  try {
    const res = await axios.get(
      `${process.env.WD_PDF_API_URL}/${process.env.WD_PDF_API_KEY}/${file_nbr}`,
      {
        headers: {
          Accept: "text/xml",
          "Content-Type": "text/xml; charset=utf-8",
        },
      }
    );
    return res.data?.hawb?.b64str;
  } catch (e) {}
}

function formatDate(dateObj) {
  var date = new Date(dateObj);
  return (
    date.getFullYear() +
    ("00" + (date.getMonth() + 1)).slice(-2) +
    ("00" + date.getDate()).slice(-2) +
    ("00" + date.getHours()).slice(-2) +
    ("00" + date.getMinutes()).slice(-2) +
    ("00" + date.getSeconds()).slice(-2)
  );
}

function response(code, message) {
  return JSON.stringify({
    httpStatus: code,
    message,
  });
}
