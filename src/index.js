/**
 * 作者: bullub
 * 日期: 2017/1/3 13:42
 * 用途:
 */
"use strict";
const through2 = require("through2");
const resourceIntegration = require("resource-integration");
const gulpUtil = require("gulp-util");
const crypto = require("crypto");
const path = require("path");

const BuildHelper = resourceIntegration.BuildHelper;




module.exports = function (options) {
    options = Object.assign({}, {srcRoot: "./src"}, options);
    let srcRoot = path.resolve(options.srcRoot);
    let addedFiles = [];

    //已经合并过的记录，通过hash记录，相当于做一层缓存
    let _combinedRecords = {};

    return through2.obj(function (file, encoding, next) {
        var self = this;
        if(!file || file.isStream() || !file.contents) {
            next(null, file);
            return ;
        }

        //解析当前文件中包含的语法
        let syntaxInfo = null;
        try {
            syntaxInfo = resourceIntegration.resolveSyntax(file.contents.toString("utf-8"), file.path);
        } catch (e) {
            self.emit('error', new gulpUtil.PluginError('gulp-resource-integration', e.message));
        }

        if(null === syntaxInfo) {
            return ;
        }

        let {combinedRecords, contentLines} = syntaxInfo;

        //遍历当前文件的合并记录
        combinedRecords.forEach(combinedRecord => {
            //拿到包含的所有文件的列表(这个包含的都是文件的绝对路径)
            let includeFiles = BuildHelper.getRealFilePath(file, combinedRecord.files, srcRoot),
                //合并后的结果
                combinedResult,
                //构建后的目标文件
                buildFile,
                //当前构建的hash值
                hash = sha512(includeFiles.join(","));

            if(_combinedRecords[hash]) {
                //如果该hash对应的合并已有记录，则将当前的记录合并
                combinedResult = _combinedRecords[hash].result;
                buildFile = _combinedRecords[hash].file
            } else {
                //将源码根路径添加到合并记录对象上
                combinedRecord.srcRoot = srcRoot;
                //执行构建，拿到合并后的内容
                combinedResult = resourceIntegration.buildBySyntaxInfo(file, combinedRecord, includeFiles);
                if(combinedResult.errors.length) {
                    //构建报错了
                    console.error("errors");
                }

                //生成目标文件
                buildFile = BuildHelper.getDistFile(file, srcRoot, combinedRecord.distFile, combinedResult.contents);


                //将目标文件添加到新增的文件列表中
                addedFiles.push(buildFile);

                _combinedRecords[hash] = {
                    result: combinedResult,
                    file: buildFile
                };
            }

            //将重写的标签加到
            contentLines[combinedRecord.startLine] = contentLines[combinedRecord.startLine] + "\n" + BuildHelper.getTag(file, buildFile, combinedRecord.type);

            contentLines[combinedRecord.endLine] = '';

        });

        file.contents = Buffer.from(contentLines.join("\n"), "utf8");

        next(null, file);

    }, function(finish){

        addedFiles.forEach((file)=>{
            this.push(file);
        });

        finish();
    });
};

function sha512(value) {
    return crypto.createHash("sha512").update(value).digest("hex");
}