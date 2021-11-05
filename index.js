'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var stylelint = require('stylelint');
var fs = require('fs');
var path = require('path');
var postcss = require('postcss');
var resolve = require('resolve');
var postcssValuesParser = require('postcss-values-parser');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n["default"] = e;
  return Object.freeze(n);
}

var stylelint__default = /*#__PURE__*/_interopDefaultLegacy(stylelint);
var fs__default = /*#__PURE__*/_interopDefaultLegacy(fs);
var path__default = /*#__PURE__*/_interopDefaultLegacy(path);
var postcss__default = /*#__PURE__*/_interopDefaultLegacy(postcss);
var resolve__default = /*#__PURE__*/_interopDefaultLegacy(resolve);

function resolveId(id, basedir, {
  paths = [],
  moduleDirectories = ['node_modules'],
  extensions = ['.css']
} = {}) {
  const resolveOpts = {
    basedir,
    moduleDirectory: moduleDirectories,
    paths,
    extensions,
    preserveSymlinks: false
  };
  return new Promise((res, rej) => {
    resolve__default["default"](id, resolveOpts, (err, resolvedPath) => err ? rej(err) : res(resolvedPath));
  });
}

async function getCustomPropertiesFromRoot(root, resolver) {
  // initialize custom selectors
  let customProperties = {}; // resolve current file directory

  let sourceDir = __dirname;

  if (root.source && root.source.input && root.source.input.file) {
    sourceDir = path__default["default"].dirname(root.source.input.file);
  } // recursively add custom properties from @import statements


  const importPromises = [];
  root.walkAtRules('import', atRule => {
    const fileName = atRule.params.replace(/['|"]/g, '');

    if (path__default["default"].isAbsolute(fileName)) {
      importPromises.push(getCustomPropertiesFromCSSFile$1(fileName, resolver));
    } else {
      const promise = resolveId(fileName, sourceDir, {
        paths: resolver.paths,
        extensions: resolver.extensions,
        moduleDirectories: resolver.moduleDirectories
      }).then(filePath => getCustomPropertiesFromCSSFile$1(filePath, resolver)).catch(() => {});
      importPromises.push(promise);
    }
  });
  (await Promise.all(importPromises)).forEach(propertiesFromImport => {
    customProperties = Object.assign(customProperties, propertiesFromImport);
  }); // for each custom property declaration

  root.walkDecls(customPropertyRegExp, decl => {
    const {
      prop
    } = decl; // write the parsed value to the custom property

    customProperties[prop] = decl.value;
  }); // return all custom properties, preferring :root properties over html properties

  return customProperties;
} // match custom properties

const customPropertyRegExp = /^--[A-z][\w-]*$/;

async function getCustomPropertiesFromCSSFile$1(from, resolver) {
  try {
    const css = await fs.promises.readFile(from, 'utf8');
    const root = postcss__default["default"].parse(css, {
      from
    });
    return await getCustomPropertiesFromRoot(root, resolver);
  } catch (e) {
    return {};
  }
}

/* Get Custom Properties from CSS File
/* ========================================================================== */

async function getCustomPropertiesFromCSSFile(from, resolver) {
  const css = await readFile(from);
  const root = postcss__default["default"].parse(css, {
    from
  });
  return await getCustomPropertiesFromRoot(root, resolver);
}
/* Get Custom Properties from Object
/* ========================================================================== */


function getCustomPropertiesFromObject(object) {
  const customProperties = Object.assign({}, Object(object).customProperties, Object(object)['custom-properties']);
  return customProperties;
}
/* Get Custom Properties from JSON file
/* ========================================================================== */


async function getCustomPropertiesFromJSONFile(from) {
  const object = await readJSON(from);
  return getCustomPropertiesFromObject(object);
}
/* Get Custom Properties from JS file
/* ========================================================================== */


async function getCustomPropertiesFromJSFile(from) {
  const object = await (function (t) { return Promise.resolve().then(function () { return /*#__PURE__*/_interopNamespace(require(t)); }); })(from);
  return getCustomPropertiesFromObject(object);
}
/* Get Custom Properties from Sources
/* ========================================================================== */


function getCustomPropertiesFromSources(sources, resolver) {
  return sources.map(source => {
    if (source instanceof Promise) {
      return source;
    } else if (source instanceof Function) {
      return source();
    } // read the source as an object


    const opts = source === Object(source) ? source : {
      from: String(source)
    }; // skip objects with Custom Properties

    if (opts.customProperties || opts['custom-properties']) {
      return opts;
    } // source pathname


    const from = path__default["default"].resolve(String(opts.from || '')); // type of file being read from

    const type = (opts.type || path__default["default"].extname(from).slice(1)).toLowerCase();
    return {
      type,
      from
    };
  }).reduce(async (customProperties, source) => {
    const {
      type,
      from
    } = await source;

    if (type === 'css') {
      return Object.assign(await customProperties, await getCustomPropertiesFromCSSFile(from, resolver));
    }

    if (type === 'js') {
      return Object.assign(await customProperties, await getCustomPropertiesFromJSFile(from));
    }

    if (type === 'json') {
      return Object.assign(await customProperties, await getCustomPropertiesFromJSONFile(from));
    }

    return Object.assign(await customProperties, await getCustomPropertiesFromObject(await source));
  }, {});
}
/* Promise-ified utilities
/* ========================================================================== */

const readFile = from => new Promise((resolve, reject) => {
  fs__default["default"].readFile(from, 'utf8', (error, result) => {
    if (error) {
      reject(error);
    } else {
      resolve(result);
    }
  });
});

const readJSON = async from => JSON.parse(await readFile(from));

var ruleName = 'csstools/value-no-unknown-custom-properties';

var messages = stylelint__default["default"].utils.ruleMessages(ruleName, {
  unexpected: (name, prop) => `Unexpected custom property "${name}" inside declaration "${prop}".`
});

var validateDecl = ((decl, {
  result,
  customProperties
}) => {
  const valueAST = postcssValuesParser.parse(decl.value);
  validateValueAST(valueAST, {
    result,
    customProperties,
    decl
  });
}); // validate a value ast

const validateValueAST = (ast, {
  result,
  customProperties,
  decl
}) => {
  if (Object(ast.nodes).length) {
    ast.nodes.forEach(node => {
      if (isVarFunction(node)) {
        const [propertyNode, comma, ...fallbacks] = node.nodes;
        const propertyName = propertyNode.value;

        if (propertyName in customProperties) {
          return;
        } // conditionally test fallbacks


        if (fallbacks.length) {
          validateValueAST({
            nodes: fallbacks.filter(isVarFunction)
          }, {
            result,
            customProperties,
            decl
          });
          return;
        } // report unknown custom properties


        stylelint__default["default"].utils.report({
          message: messages.unexpected(propertyName, decl.prop),
          node: decl,
          result,
          ruleName,
          word: String(propertyName)
        });
      } else {
        validateValueAST(node, {
          result,
          customProperties,
          decl
        });
      }
    });
  }
}; // whether the node is a var() function


const isVarFunction = node => node.type === 'func' && node.name === 'var' && node.nodes[0].isVariable;

var validateResult = ((result, customProperties) => {
  // validate each declaration
  result.root.walkDecls(decl => {
    if (hasCustomPropertyReference(decl)) {
      validateDecl(decl, {
        result,
        customProperties
      });
    }
  });
}); // match custom property inclusions

const customPropertyReferenceRegExp = /(^|[^\w-])var\([\W\w]+\)/; // whether a declaration references a custom property

const hasCustomPropertyReference = decl => customPropertyReferenceRegExp.test(decl.value);

var index = stylelint__default["default"].createPlugin(ruleName, (method, opts) => {
  // sources to import custom selectors from
  const importFrom = [].concat(Object(opts).importFrom || []);
  const resolver = Object(opts).resolver || {}; // promise any custom selectors are imported

  const customPropertiesPromise = isMethodEnabled(method) ? getCustomPropertiesFromSources(importFrom, resolver) : {};
  return async (root, result) => {
    // validate the method
    const isMethodValid = stylelint__default["default"].utils.validateOptions(result, ruleName, {
      actual: method,

      possible() {
        return isMethodEnabled(method) || isMethodDisabled(method);
      }

    });

    if (isMethodValid && isMethodEnabled(method)) {
      // all custom properties from the file and imports
      const customProperties = Object.assign(await customPropertiesPromise, await getCustomPropertiesFromRoot(root, resolver)); // validate the css root

      validateResult(result, customProperties);
    }
  };
});

const isMethodEnabled = method => method === true;

const isMethodDisabled = method => method === null || method === false;

exports["default"] = index;
exports.ruleName = ruleName;
//# sourceMappingURL=index.js.map
