/*
Loosely based on python code published on: 
http://www.drdobbs.com/testing/error-correction-with-reed-solomon/240157266?pgno=1

this code was developed with the objective of creating a efficient routine for processing QRcodes or other reed Solomon based items in HTML 5


The MIT License (MIT)

Copyright (c) 2014 Kenneth W Lichtenberger

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.





*/
function ReedSolomon(){
    this.exp = new Uint8Array(512)
    this.log = new Uint8Array(256)
    this.doInit()
}
ReedSolomon.prototype ={
    doInit:function(){
        var i = 1
        var byteValu = 1
        this.exp[0] = 1
        do{
            byteValu <<= 1
            byteValu ^= (0x11d & (-(byteValu & 0x100)>>31))
            this.exp[i] = byteValu
            this.log[byteValu] = i
            i++
        }while (i<255);
        do{
            this.exp[i] = this.exp[i-255]
            i++
        }while(i<512);
    },
    product: function(x,y){
        if((~(-x) | ~(-y)) >>31 ) return 0
        return this.exp[this.log[x] + this.log[y]]
    },
    quotient: function(x,y){
        if(y == 0) throw "Divide by Zero"
        if(x == 0) return 0
        return this.exp[this.log[x] - this.log[y] + 255] 
            
    },
    polySum:function(x,y){
        var xl = x.length
        var yl = y.length
        var l = Math.max(xl,yl)
        var s = new Uint8Array(l)
        var i = 0
        do{
            s[i+l-xl] = x[i]
            i++
        }while(i<xl)
        i = 0
        do{
            s[i+l-yl] ^= y[i]
            i++
        }while(i<yl)
        return s
        
    },
    polyProduct:function(x,y){
        var xl = x.length
        var yl= y.length
        var l = xl+yl-1
        var prod = new Uint8Array(l)
        var xi = 0
        var yi = 0
        var _i = 0
        do{
            prod[xi+yi] ^= this.product(x[xi],y[yi])
            xi++
            _i = l-xi>>31
            xi &= ~_i
            yi += 1&_i
        }while(yi < yl)
        return prod
    },
    polyScale:function(arg,x){
        var l = arg.length
        var val = new Uint8Array(l)
        var i = 0
        do{
            val[i] = this.product(arg[i],x)
            i++
        }while(i<l);
        return val
    },
    polyEval:function(arg,x){
        var b = arg[0]
        var l = arg.length
        var i = 1
        while(i<l){
            b = arg[i]^this.product(b,x)
            i++
        }
        return b
    },
    rsGenPoly:function(l){
        var val = new Uint8Array(1)
        var tmp = new Uint8Array(2)
        
        tmp[0] = 1
        val[0] = 1
        var i = 0
        do{
            tmp[1] = this.exp[i]
            val = this.polyProduct(val,tmp)
            i++
        }while(i<l)
        return val    
    },
    RSEncode:function(buff,size){
        var poly = this.rsGenPoly(size)
        var pl = poly.length
        var inL = buff.length
        var l = inL+size
        var out = new Uint8Array(l)
        var i = 0
        var i2 = 0
        do{out[i] = buff[i++]}while(i<inL)
        i = 0
        var b
        do{
            b = out[i]
            i2 = 0
            do{
                out[i+i2] ^= this.product(poly[i2++],b) 
            }while(i2<pl)
            i++
        }while(i<inL);
        i = 0
        do{out[i] = buff[i++]}while(i<inL)
        return out
    },
    rsSyndPoly:function (buff,size){
        var val = new Uint8Array(size)
        var i = 0
        do{
            val[i] = this.polyEval(buff,this.exp[i++])
        }while(i<size)
        return val
    },
    rsFindErr:function(synd,size){
        var err = new Uint8Array(1)
        var tmp = new Uint8Array(1)
        err[0] = 1
        tmp[0] = 1
        var _tmp
        var z =0
        var i = 0
        var i2 =0
        var l = synd.length
        var l2 = 0
        var term = 0
        do{
           _tmp = new Uint8Array(tmp.length+1)
           _tmp.set(tmp)
           tmp = _tmp;
           term = synd[i]
           l2 = err.length
           i2 = 1
           do{term ^= this.product(err[l2-i2-1],synd[i-i2]);i2++}while(i2<l2);
           if(term){
               if(tmp.length > err.length){
                   _tmp = this.polyScale(tmp, term)
                   tmp = this.polyScale(err,this.quotient(1,term)) 
                   err = _tmp
               }
               _tmp = this.polyScale(tmp, term)
               err = this.polySum(err, _tmp)
           }
           i++
        }while(i<l)
        var errCount = err.length-1
        if ((errCount * 2) > l) throw "Too many errors to correct " + errCount + ' ' + l
        var errList = new Uint8Array(size)
        var foundi = 0
        i = 0
        var z = 0
        do{
            z = this.polyEval(err,this.exp[255-i])
            if(z == 0){
              errList[foundi++] = size-i-1  
            }
            i++
        }while(i<size);
       
        if (foundi != errCount) throw "Could not locate the errors " + foundi + ' ' + errCount
        return new Uint8Array(errList.buffer.slice(0,foundi))
        
    },
    rsCorrect:function (buff,synd,err){
        var locator = new Uint8Array(1)
        locator[0] = 1
        var i = 0
        
        var l = buff.length
        var el = err.length
        var i2 = el-1
        var errEval = new Uint8Array(el)
        var _tmp

        do{

            errEval[i2] = synd[i]
            _tmp = new Uint8Array(2)
            _tmp[0] = this.exp[l - err[i] - 1]
            _tmp[1] = 1
            
            locator = this.polyProduct(locator,_tmp)
            i++
            i2--
        }while(i<el)
        
        errEval = this.polyProduct(errEval, locator)
        var vl = errEval.length
        var tMark =  vl - el
        errEval = new Uint8Array(errEval.buffer.slice(tMark,vl))
        
        var pl = locator.length
        var start = pl%1
        var i = 0
        var errLoci = new Uint8Array(pl)
        while(start < pl){ // fix me maybe we can calc the length with out i and the slice
            errLoci[i] = locator[start]
            i++
            start+=2
        }
        errLoci = new Uint8Array(errLoci.buffer.slice(0,i))
        i = 0
        var errByte = 0
        var errValu = 0
        var errAdj = 0
        var tmp =0
        do{
            tmp = err[i]
            errByte = this.exp[tmp - l + 256]
            errValu = this.polyEval(errEval,errByte)
            errAdj = this.polyEval(errLoci,this.product(errByte,errByte))
            buff[tmp] ^= this.quotient(errValu,this.product(errByte,errAdj))
            i++
        }while(i<el)
        return buff

    }
   
    
  
}

function buffeq(a,b){
    var i = 0
    var l = a.length
    var s = 0
    var tmp = 0
    do{
        tmp = (a[i] ^ b[i])
        
        s += (-tmp>>>31)
        i++
        
    }while(i<l);
    return s
}

var it = new ReedSolomon()
//console.log(Array.prototype.slice.call(it.exp))
//console.log(Array.prototype.slice.call(it.log))
//console.log(Array.prototype.slice.call(it.RSEncode([5,42,5,42],22)))
var tMesg = new Uint8Array([1,2,3,4,5])
var tSize = 20
console.log(JSON.stringify(Array.prototype.slice.call(it.rsSyndPoly(tMesg, tSize))))
var tCode = it.RSEncode(tMesg, tSize)

console.log(JSON.stringify(Array.prototype.slice.call(tCode)))
tCode[0]= 42
tCode[1]= 42
tCode[2]= 42
tCode[3]= 42
tCode[4]= 42
tCode[5]= 42
tCode[9]= 42
console.log(JSON.stringify(Array.prototype.slice.call(tCode)))
var polySynd = it.rsSyndPoly(tCode, tSize)
var d = it.rsFindErr(polySynd,tCode.length)
console.log(JSON.stringify(Array.prototype.slice.call(d)))

console.log(JSON.stringify(Array.prototype.slice.call(it.rsCorrect(tCode,polySynd,d))))
