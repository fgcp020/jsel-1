/*
 * List Template
 * License LGPL(您可以在任何地方免费使用,但请不要吝啬您对框架本身的改进)
 * http://www.xidea.org/project/lite/
 * @author jindw
 * @version $Id: template.js,v 1.4 2008/02/28 14:39:06 jindw Exp $
 */
/**
 * 表达式对象，可以单步解释表达式中间代码
 */
function Expression(value){
	if(typeof value == 'string'){
		value = new ExpressionTokenizer(value).getResult();
	}else if(value instanceof Expression){
		return value;
	}
	this.token = value;
}
Expression.prototype.evaluate = function(context){
     return evaluate(context,this.token);
}
/**
 * {
 *    varName:["","a","a.b","a.*.b"]
 * }
 */
Expression.prototype.getVarMap = function(){
	init(this);
	return this.varMap;
	
}
/**
 * {
 *    methodName:["","a","a.b","*",'a.1.*.x','.a.1']
 * }
 */
Expression.prototype.getCallMap = function(){
	init(this);
	return this.callMap;
}
function init(thiz){
	if(thiz.callMap == null){
		thiz.callMap = {};
		thiz.varMap = {};
		walkEL(thiz.token,thiz);
	}
}
function walkEL(token,context){
	var op = token[0];
	if(op<=0){
		if(op == VALUE_VAR){
			_addKeyList(context.varMap,token[1],'');
		}
		return;
	}else{
		var arg1 = token[1];
		if(op == OP_INVOKE){
			if(arg1[0] == VALUE_VAR){
				_addKeyList(context.callMap,arg1[1],'');
			}else if(arg1[0] == OP_GET){//member
				var list = walkMembers(arg1,context,[]).reverse();
				var ps = list.slice(1).join('.');
				if(list[0] != ''){//!constants,what about constants, map,list?
					if(list[0] != '*' ){//vars
						_addKeyList(context.varMap,list[0],ps);
					}
					_addKeyList(context.callMap,list[0],ps);
				}
			}else{
				walkEL(arg1,context);
				_addKeyList(context.callMap,"*",'');
			}
		}else{
			if(op == OP_GET){
				var list = walkMembers(token,context,[]).reverse();
				var ps = list.slice(1).join('.');
				if(list[0] != ''){//!constants,what about constants, map,list?
					if(list[0] != '*' ){//vars
						_addKeyList(context.varMap,list[0],ps);
					}
				}
			}else{
				arg1 && walkEL(arg1,context);
			}
		}
		var pos = getTokenParamIndex(token[0]);
		if(pos>2){//invoke args... 
			walkEL(token[2],context);
		}
	}
}
function walkMembers(token,context,buf){//[get,owner,key]
	var owner = token[1];
	var key = token[2];
	if(key[0] == VALUE_CONSTANTS){
		buf.push(key[1]);
	}else{
		walkEL(key,context);
		buf.push('*');
	}
	
	if(owner[0] == VALUE_VAR){
		buf.push(owner[1]);//跳过 设置 varMap
	}else if(owner[0] == VALUE_CONSTANTS){
		buf.push('');
	}else if(owner[0] == OP_GET){
		walkMembers(owner,context,buf);
	}else{
		walkEL(owner,context);
		buf.push('*');
	}
	return buf;
}
function _addKeyList(map,key,value){
	var list = key in map? map[key]: (map[key] = []);
	if(list.indexOf(value) <0){
		list.push(value);
	}
	return list;
}
Expression.prototype.toString = function(context){
	return stringifyJSEL(this.token,context||defaultContext);
	//return JSON.stringify(this.token);
}
Expression.evaluate = evaluate;
/**
 * 表达式单步解析函数实现
 */
function evaluate(context,el){
     var result = _evaluate(el,context)
     return realValue(result);
}

function innerEval(){
	return eval(arguments[0]);
}
function _evaluate(item,context){
    var type = item[0];
    switch(type){
    case VALUE_LIST:
        return [];
    case VALUE_MAP:
        return {};
    case VALUE_VAR:
        arg1 = item[1]
        return (arg1 in context?context:this)[arg1];
    case VALUE_CONSTANTS:
    	arg1 = item[1];
        return arg1&&arg1['class'] == 'RegExp'?innerEval(arg1.literal):arg1;
    ///* and or */
    case OP_AND:
        return realValue(_evaluate(item[1],context)) && (_evaluate(item[2],context));
    case OP_OR:
        return realValue(_evaluate(item[1],context)) || (_evaluate(item[2],context));
    case OP_QUESTION://// a?b:c -> a?:bc -- >a?b:c
        if(realValue(_evaluate(item[1],context))){
            return _evaluate(item[2],context);
        }else{
            return PropertyValue;//use as flag
        }
    case OP_QUESTION_SELECT:
    	arg1 = realValue(_evaluate(item[1],context));
        if(arg1 == PropertyValue){//use as flag
            return _evaluate(item[2],context);
        }else{
            return arg1;
        }
    }
    var arg1=_evaluate(item[1],context);
    if(getTokenParamIndex(type) ==3){
        var arg2=realValue(_evaluate(item[2],context));
    }
    if(type == OP_INVOKE){
    	if(typeof arg1 == 'function'){
            return arg1.apply(context,arg2);
    	}else if(arg1 instanceof PropertyValue){
    		var thiz = arg1[0];
    		var key = arg1[1];
    		var fn = thiz[key];
    		//bugfix replace(RegExp
    		if(fn == String.prototype.replace || fn == String.prototype.match){
    			arg2 = arg2.slice(0);
    			var exp = arg2[0];
    			if(exp && exp['class'] == 'RegExp'){
    				arg2[0] = innerEval(exp.literal)
    			}
    			
    		}
            return fn.apply(thiz,arg2);
    	}else{
    		throw new Error("not a fn!!"+arg1)
    	}
    }
    arg1 = realValue(arg1);
    switch(type){
    //op
//    case OP_GET_STATIC_PROP:
//        arg2 =getTokenParam(item);
    case OP_GET:
        return new PropertyValue(arg1,arg2);
    case OP_NOT:
        return !arg1;
    case OP_POS:
        return +arg1;
    case OP_NEG:
        return -arg1;
        ///* +-*%/ */
    case OP_ADD:
        return arg1+arg2;
    case OP_SUB:
        return arg1-arg2;
    case OP_MUL:
        return arg1*arg2;
    case OP_DIV:
        return arg1/arg2;
    case OP_MOD:
        return arg1%arg2;
        ///* boolean */
    case OP_GT:
        return arg1 > arg2;
    case OP_GTEQ:
        return arg1 >= arg2;
    case OP_NE:
        return arg1 != arg2;
    case OP_NE_STRICT:
        return arg1 !== arg2;
    case OP_EQ:
        return arg1 == arg2;
    case OP_EQ_STRICT:
        return arg1 === arg2;
        
    case OP_LT:
        return arg1 < arg2;
    case OP_LTEQ:
        return arg1 <= arg2;
    case OP_IN:
        return arg1 in arg2;


    case OP_JOIN:
        arg1.push(arg2)
        return arg1;
    case OP_PUT:
        arg1[getTokenParam(item)]= arg2;
        return arg1;
    }
}

function PropertyValue(base,name){
    this[0] = base;
    this[1] = name;
}
function realValue(arg1){
    if(arg1 instanceof PropertyValue){
        return arg1[0][arg1[1]];
    }
    return arg1;
}

var ID_PATTERN_QUTE = /^"[a-zA-Z_\$][_\$\w]*"$/;
var defaultContext = {
	getForName:String,
	findForAttribute:function(varName,propertyName){},
	getVarName:function(varName){
		return varName;
	},
	genGetCode:function(owner,property){
		if(ID_PATTERN_QUTE.test(property)){
			return owner+'.'+property.slice(1,-1);
		}else{
			return owner+'['+property+']';
		}
	}
}
var stringifyJSEL = require('./el-translator.js').stringifyJSEL
var ExpressionTokenizer=require('./expression-tokenizer').ExpressionTokenizer;
var getTokenParam=require('./expression-token').getTokenParam;
var getTokenParamIndex=require('./expression-token').getTokenParamIndex;
var OP_ADD=require('./expression-token').OP_ADD;
var OP_AND=require('./expression-token').OP_AND;
var OP_DIV=require('./expression-token').OP_DIV;
var OP_EQ=require('./expression-token').OP_EQ;
var OP_EQ_STRICT=require('./expression-token').OP_EQ_STRICT;
var OP_GET=require('./expression-token').OP_GET;
var OP_GT=require('./expression-token').OP_GT;
var OP_GTEQ=require('./expression-token').OP_GTEQ;
var OP_IN=require('./expression-token').OP_IN;
var OP_INVOKE=require('./expression-token').OP_INVOKE;
var OP_JOIN=require('./expression-token').OP_JOIN;
var OP_LT=require('./expression-token').OP_LT;
var OP_LTEQ=require('./expression-token').OP_LTEQ;
var OP_MOD=require('./expression-token').OP_MOD;
var OP_MUL=require('./expression-token').OP_MUL;
var OP_NE=require('./expression-token').OP_NE;
var OP_NEG=require('./expression-token').OP_NEG;
var OP_NE_STRICT=require('./expression-token').OP_NE_STRICT;
var OP_NOT=require('./expression-token').OP_NOT;
var OP_OR=require('./expression-token').OP_OR;
var OP_POS=require('./expression-token').OP_POS;
var OP_PUT=require('./expression-token').OP_PUT;
var OP_QUESTION=require('./expression-token').OP_QUESTION;
var OP_QUESTION_SELECT=require('./expression-token').OP_QUESTION_SELECT;
var OP_SUB=require('./expression-token').OP_SUB;
var VALUE_CONSTANTS=require('./expression-token').VALUE_CONSTANTS;
var VALUE_LIST=require('./expression-token').VALUE_LIST;
var VALUE_MAP=require('./expression-token').VALUE_MAP;
var VALUE_VAR=require('./expression-token').VALUE_VAR;

module.exports =Expression;
Expression.Expression=Expression;
