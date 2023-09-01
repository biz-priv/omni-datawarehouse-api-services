const shipment_header_table = process.env.SHIPMENT_HEADER_TABLE
const shipper_table = process.env.SHIPPER_TABLE
const consignee_table = process.env.CONSIGNEE_TABLE
const shipment_desc_table = process.env.SHIPMENT_DESC_TABLE
const reference_table = process.env.REFERENCE_TABLE
const shipment_milestone_table = process.env.SHIPMENT_MILESTONE_TABLE
const tracking_notes_table_indexValue = process.env.TRACKING_NOTES_TABLE_INDEXVALUE

const customerTypeValue = {
    S: "Shipper",
    C: "Consignee",
    default: "Billto"
}
const weightDimensionValue = {
    K: "Kg",
    default: "lb"
}
const tableValues = [
    { tableName: process.env.SHIPPER_TABLE, pKey: "FK_ShipOrderNo", getValues: "FK_ShipOrderNo, ShipName, ShipAddress1, ShipCity, FK_ShipState, ShipZip, FK_ShipCountry" },
    { tableName: process.env.CONSIGNEE_TABLE, pKey: "FK_ConOrderNo", getValues: "FK_ConOrderNo, ConName, ConAddress1, ConCity, FK_ConState, ConZip, FK_ConCountry" },
    { tableName: process.env.SHIPMENT_DESC_TABLE, pKey: "FK_OrderNo", getValues: "FK_OrderNo, Pieces, Weight, ChargableWeight, WeightDimension" },
    { tableName: process.env.REFERENCE_TABLE, pKey: "PK_ReferenceNo", getValues: "PK_ReferenceNo, FK_RefTypeId, CustomerType, ReferenceNo" },
    { tableName: process.env.SHIPMENT_MILESTONE_TABLE, pKey: "FK_OrderNo", getValues: "FK_OrderNo, EventDateTime, EventTimeZone, FK_OrderStatusId, FK_ServiceLevelId" },
  ];
const INDEX_VALUES = {
    TRACKING_NOTES: {
        INDEX: process.env.TRACKING_NOTES_TABLE_INDEXVALUE
    }
}
module.exports = {
    customerTypeValue,
    weightDimensionValue,
    tableValues,
    INDEX_VALUES
  };