const AWS = require("aws-sdk");
const { get } = require("lodash");
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const sqs = new AWS.SQS();
const { SHIPMENT_HEADER_TABLE, SHIPMENT_HEADER_TABLE_STREAM_QUEUE } =
	process.env;

module.exports.handler = async (event) => {
	console.log(
		"🚀 ~ file: shipment_header_table_stream_processor.js:8 ~ exports.handler= ~ event:",
		JSON.stringify(event)
	);

	event.Records.forEach(async (record) => {
		console.log(
			"🚀 ~ file: shipment_header_table_stream_processor.js:11 ~ event.Records.forEach ~ record:",
			JSON.stringify(record)
		);
		if (get(record, "eventName") === "INSERT") {
			const billNumber = Number(
				get(record, "dynamodb.NewImage.BillNo.S", null)
			);
			const allowedBillNumbers = [9146];
			if (!allowedBillNumbers.includes(billNumber)) {
				console.log(`${billNumber} is not in ${allowedBillNumbers}: SKIPPING`);
				return;
			} //For Shippeo bill number is 9146

			const pKey = get(record, "dynamodb.Keys.PK_OrderNo.S");
			const getItemParam = {
				TableName: SHIPMENT_HEADER_TABLE,
				Key: {
					PK_OrderNo: pKey,
				},
			};
			console.log(
				"🚀 ~ file: shipment_header_table_stream_processor.js:23 ~ event.Records.forEach ~ getItemParam:",
				getItemParam
			);
			const item = await dynamoDB.get(getItemParam).promise();
			console.log(
				"🚀 ~ file: shipment_header_table_stream_processor.js:25 ~ event.Records.forEach ~ item:",
				item
			);

			const queueUrl = SHIPMENT_HEADER_TABLE_STREAM_QUEUE;
			const queueMessage = {
				QueueUrl: queueUrl,
				MessageBody: JSON.stringify(item),
			};
			console.log(
				"🚀 ~ file: shipment_header_table_stream_processor.js:31 ~ event.Records.forEach ~ queueMessage:",
				queueMessage
			);
			await sqs.sendMessage(queueMessage).promise();
		}
	});

	return `Successfully processed ${event.Records.length} records.`;
};
