/*
 * Copyright 2016 Telefonica Investigación y Desarrollo, S.A.U
 *
 * This file is part of fiware-iotagent-lib
 *
 * fiware-iotagent-lib is free software: you can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version.
 *
 * fiware-iotagent-lib is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public
 * License along with fiware-iotagent-lib.
 * If not, seehttp://www.gnu.org/licenses/.
 *
 * For those usages not covered by the GNU Affero General Public License
 * please contact with::daniel.moranjimenez@telefonica.com
 *
 * Developed by: Federico M. Facca - Martel Innovate
 */

/* eslint-disable consistent-return */
/* eslint-disable no-self-assign */
/* eslint-disable no-unused-vars */

const jexl = require('jexl');
const errors = require('../errors');
const logger = require('logops');
const config = require('../commonConfig');
const baseTranformsMap = require('../jexlTranformsMap.js').map;
const logContext = {
    op: 'IoTAgentNGSI.JEXL'
};

function parse(expression, context, callback) {
    let result;
    let error;

    try {
        result = jexl.evalSync(expression, context);
        logger.debug(logContext, 'parse expression "[%j]" over "[%j]" result "[%j]" ', expression, context, result);
    } catch (e) {
        error = new errors.InvalidExpression(expression);
        if (callback) {
            callback(error);
        } else {
            throw error;
        }
    }

    if (callback) {
        callback(null, result);
    } else {
        return result;
    }
}

function extractContext(attributeList) {
    const context = {};
    let value;

    for (let i = 0; i < attributeList.length; i++) {
        if (isNaN(attributeList[i].value)) {
            value = attributeList[i].value;
        } else {
            let floatValue = Number.parseFloat(attributeList[i].value);
            if (!Number.isNaN(floatValue) && !Number.isInteger(floatValue)) {
                value = floatValue;
            } else if (!Number.isNaN(Number.parseInt(attributeList[i].value))) {
                value = Number.parseInt(attributeList[i].value);
            } else if (String(attributeList[i].value) === 'true') {
                value = true;
            } else if (String(attributeList[i].value) === 'false') {
                value = false;
            } else {
                value = attributeList[i].value;
            }
        }
        if (attributeList[i].name) {
            context[attributeList[i].name] = value;
        }
        /*jshint camelcase: false */
        if (attributeList[i].object_id) {
            context[attributeList[i].object_id] = value;
        }
        /*jshint camelcase: true */
    }

    return context;
}

function applyExpression(expression, context, typeInformation) {
    const result = jexl.evalSync(expression, context);
    logger.debug(logContext, 'applyExpression "[%j]" over "[%j]" result "[%j]" ', expression, context, result);
    const expressionResult = result !== undefined ? result : expression;
    return expressionResult;
}

function expressionApplier(context, typeInformation) {
    return function (attribute) {
        /**
         * Determines if a value is of type float
         *
         * @param      {String}   value       Value to be analyzed
         * @return     {boolean}              True if float, False otherwise.
         */
        function isFloat(value) {
            return !isNaN(value) && value.toString().indexOf('.') !== -1;
        }

        const newAttribute = {
            name: attribute.name,
            type: attribute.type
        };

        /*jshint camelcase: false */
        if (attribute.object_id) {
            newAttribute.object_id = attribute.object_id;
        }

        newAttribute.value = applyExpression(attribute.expression, context, typeInformation);
        return newAttribute;
    };
}

function isTransform(identifier) {
    return jexl.getTransform(identifier) !== (null || undefined);
}

function contextAvailable(expression, context) {
    let error;
    try {
        jexl.evalSync(expression, context);
        return true;
    } catch (e) {
        error = new errors.InvalidExpression(expression);
        throw error;
    }
}

function processExpressionAttributes(typeInformation, list, context) {
    return list
        .filter(function (item) {
            return item.expression && contextAvailable(item.expression, context);
        })
        .map(expressionApplier(context, typeInformation));
}

function checkTransformationMap(tranformsMap) {
    let error = null;
    let message = 'No trasformations were added to JEXL Parser';
    let resultMap = {};

    if (typeof tranformsMap != 'object') {
        error = true;
    } else if (
        tranformsMap === null ||
        (tranformsMap && Object.keys(tranformsMap).length === 0 && tranformsMap.constructor === Object)
    ) {
        //default
    } else {
        //detecting wrong transformations
        let wrongList = [];
        for (var transformation in tranformsMap) {
            if (typeof tranformsMap[transformation] != 'function') {
                wrongList.push(transformation);
            } else {
                resultMap[transformation] = tranformsMap[transformation];
            }
        }
        if (wrongList.length === 0) {
            message = 'Trasformations can be added to JEXL parser';
        } else {
            message = wrongList.toString() + ' must be a function';
        }
    }
    return [error, message, resultMap];
}

function setTransforms(configMap) {
    //Check provided transforms since they are provided by user
    //Note that in case of name conflict, baseTransformsMap would take precedence
    const tranformsMap = { ...configMap, ...baseTranformsMap };
    var [error, message, cleanTranformsMap] = checkTransformationMap(tranformsMap);
    if (!error) {
        //merge baseTransformation with provided map
        jexl.addTransforms(cleanTranformsMap);
    }
    logger.info(logContext, message);
}

exports.extractContext = extractContext;
exports.processExpressionAttributes = processExpressionAttributes;
exports.contextAvailable = contextAvailable;
exports.applyExpression = applyExpression;
exports.parse = parse;
exports.checkTransformationMap = checkTransformationMap;
exports.setTransforms = setTransforms;
