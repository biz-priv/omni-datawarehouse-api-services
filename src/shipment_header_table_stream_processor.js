const AWS = require("aws-sdk");
const { get } = require("lodash");
const moment = require("moment-timezone");
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const sqs = new AWS.SQS();
const {
	SHIPMENT_HEADER_TABLE,
	SHIPMENT_HEADER_TABLE_STREAM_QUEUE,
	AMAZON_POD_QUEUE,
	SHIPMENT_FILE_TABLE,
	TRANSACTION_TABLE,
} = process.env;
let functionName;
module.exports.handler = async (event, context) => {
	try {
		functionName = get(context, "functionName");
		console.info(
			"🚀 ~ file: shipment_header_table_stream_processor.js:8 ~ exports.handler= ~ event:",
			JSON.stringify(event)
		);

		for (const record of get(event, "Records", [])) {
			console.info(
				"🚀 ~ file: shipment_header_table_stream_processor.js:11 ~ event.Records.forEach ~ record:",
				JSON.stringify(record)
			);
			if (get(record, "eventName") === "INSERT") {
				const billNumber = Number(
					get(record, "dynamodb.NewImage.BillNo.S", null)
				);
				const orderNo = Number(
					get(record, "dynamodb.NewImage.PK_OrderNo.S", null)
				);
				const houseBill = Number(
					get(record, "dynamodb.NewImage.Housebill.S", null)
				);
				const allowedBillNumbers = [9146, 53478];
				if (!allowedBillNumbers.includes(billNumber)) {
					console.info(
						`${billNumber} is not in ${allowedBillNumbers}: SKIPPING`
					);
					return;
				} //For Shippeo bill number is 9146

				const getIfHouseBillNumberValidRes = await getIfHouseBillNumberValid(
					orderNo
				);

				if (!getIfHouseBillNumberValidRes) {
					console.info("File type is not POD or HCPOD.");
					return "File type is not POD or HCPOD.";
				}

				const pKey = get(record, "dynamodb.Keys.PK_OrderNo.S");
				const getItemParam = {
					TableName: SHIPMENT_HEADER_TABLE,
					Key: {
						PK_OrderNo: pKey,
					},
				};
				console.info(
					"🚀 ~ file: shipment_header_table_stream_processor.js:23 ~ event.Records.forEach ~ getItemParam:",
					getItemParam
				);
				const item = await dynamoDB.get(getItemParam).promise();
				console.info(
					"🚀 ~ file: shipment_header_table_stream_processor.js:25 ~ event.Records.forEach ~ item:",
					item
				);

				if (get(item, "Item", []).length === 0) {
					return `Item not found.`;
				}

				let queueUrl;
				let client;
				if (billNumber === 9146) {
					queueUrl = SHIPMENT_HEADER_TABLE_STREAM_QUEUE;
					client = "shippeo";
				}

				if (billNumber === 53478) {
					queueUrl = AMAZON_POD_QUEUE;
					client = "amazon";
				}

				const queueMessage = {
					QueueUrl: queueUrl,
					MessageBody: JSON.stringify(item),
				};
				console.info(
					"🚀 ~ file: shipment_header_table_stream_processor.js:31 ~ event.Records.forEach ~ queueMessage:",
					queueMessage
				);
				await sqs.sendMessage(queueMessage).promise();

				const insertParams = {
					TableName: TRANSACTION_TABLE,
					Item: {
						orderNumber: String(orderNo),
						houseBillNumber: String(houseBill),
						billNumber: String(billNumber),
						client,
						status: "PENDING",
						message: JSON.stringify(item),
						lastUpdateId: functionName,
						lastUpdateTime: moment.tz("America/Chicago").format(),
					},
				};

				await insertIntoTransactionTable(insertParams);
			}
		}

		return `Successfully processed ${event.Records.length} records.`;
	} catch (e) {
		console.info(
			"🚀 ~ file: shipment_header_table_stream_processor.js:117 ~ module.exports.handler= ~ e:",
			e
		);
	}
};

async function getIfHouseBillNumberValid(orderNo) {
	const params = {
		TableName: SHIPMENT_FILE_TABLE,
		KeyConditionExpression: "FK_OrderNo = :FK_OrderNo",
		FilterExpression:
			"(FK_DocType = :FK_DocType1 OR FK_DocType = :FK_DocType2) AND CustomerAccess = :CustomerAccess",
		ExpressionAttributeValues: {
			":FK_OrderNo": orderNo + "",
			":FK_DocType1": "HCPOD",
			":FK_DocType2": "POD",
			":CustomerAccess": "Y",
		},
	};

	try {
		const response = await dynamoDB.query(params).promise();
		console.log(`Response: ${JSON.stringify(response)}`);
		return get(response, "Items", []).length > 0;
	} catch (error) {
		console.error(`Unable to query. Error: ${error}`);
	}
}

async function insertIntoTransactionTable(item) {
	return dynamoDB.put(item).promise();
}
