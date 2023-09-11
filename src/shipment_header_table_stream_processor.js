const AWS = require("aws-sdk");
const { get } = require("lodash");
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const sqs = new AWS.SQS();
const {
	SHIPMENT_HEADER_TABLE,
	SHIPMENT_HEADER_TABLE_STREAM_QUEUE,
	AMAZON_POD_QUEUE,
} = process.env;

module.exports.handler = async (event) => {
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
			const allowedBillNumbers = [9146, 53478];
			if (!allowedBillNumbers.includes(billNumber)) {
				console.info(`${billNumber} is not in ${allowedBillNumbers}: SKIPPING`);
				return;
			} //For Shippeo bill number is 9146

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

			if (billNumber === 9146) {
				queueUrl = SHIPMENT_HEADER_TABLE_STREAM_QUEUE;
			}

			if (billNumber === 53478) {
				queueUrl = AMAZON_POD_QUEUE;
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
		}
	}

	return `Successfully processed ${event.Records.length} records.`;
};
