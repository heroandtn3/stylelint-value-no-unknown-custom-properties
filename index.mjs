import stylelint from 'stylelint';
import fs, { promises } from 'fs';
import path from 'path';
import postcss from 'postcss';
import resolve from 'resolve';
import { parse } from 'postcss-values-parser';

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
    resolve(id, resolveOpts, (err, resolvedPath) => err ? rej(err) : res(resolvedPath));
  });
}

async function getCustomPropertiesFromRoot(root, resolver) {
  // initialize custom selectors
  let customProperties = {}; // resolve current file directory

  let sourceDir = __dirname;

  if (root.source && root.source.input && root.source.input.file) {
    sourceDir = path.dirname(root.source.input.file);
  } // recursively add custom properties from @import statements


  const importPromises = [];
  root.walkAtRules('import', atRule => {
    const fileName = atRule.params.replace(/['|"]/g, '');

    if (path.isAbsolute(fileName)) {
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
    const css = await promises.readFile(from, 'utf8');
    const root = postcss.parse(css, {
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
  const root = postcss.parse(css, {
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
  const object = await import(from);
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


    const from = path.resolve(String(opts.from || '')); // type of file being read from

    const type = (opts.type || path.extname(from).slice(1)).toLowerCase();
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
  fs.readFile(from, 'utf8', (error, result) => {
    if (error) {
      reject(error);
    } else {
      resolve(result);
    }
  });
});

const readJSON = async from => JSON.parse(await readFile(from));

var ruleName = 'csstools/value-no-unknown-custom-properties';

var messages = stylelint.utils.ruleMessages(ruleName, {
  unexpected: (name, prop) => `Unexpected custom property "${name}" inside declaration "${prop}".`
});

var validateDecl = ((decl, {
  result,
  customProperties
}) => {
  const valueAST = parse(decl.value);
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


        stylelint.utils.report({
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

var index = stylelint.createPlugin(ruleName, (method, opts) => {
  // sources to import custom selectors from
  const importFrom = [].concat(Object(opts).importFrom || []);
  const resolver = Object(opts).resolver || {}; // promise any custom selectors are imported

  const customPropertiesPromise = isMethodEnabled(method) ? getCustomPropertiesFromSources(importFrom, resolver) : {};
  return async (root, result) => {
    // validate the method
    const isMethodValid = stylelint.utils.validateOptions(result, ruleName, {
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

export { index as default, ruleName };
//# sourceMappingURL=index.mjs.map
