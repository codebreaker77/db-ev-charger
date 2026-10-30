'use strict';
// Display-only SQL formatting. Do not change the actual statements or bind values.
function formatSql(sql){
 const parts=String(sql).split(/('(?:''|[^'])*')/g);
 for(let i=0;i<parts.length;i+=2){parts[i]=parts[i].replace(/\s+/g,' ').replace(/\b(LEFT JOIN|RIGHT JOIN|INNER JOIN|FULL JOIN|ORDER BY|GROUP BY|INSERT INTO|FOR UPDATE|SELECT|FROM|WHERE|VALUES|UPDATE|SET|BEGIN|END)\b/gi,'\n$1');}
 return parts.join('').trim().split('\n').map(line=>'    '+line.trim()).filter(line=>line.trim()).join('\n');
}
function logSql(context,sql,result){console.log(`[sql${context?' #'+context.id:''}] ${result}\n${formatSql(sql)}`);}
module.exports={formatSql,logSql};
