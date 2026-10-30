import java.sql.*;
import java.io.*;
import java.util.*;

public class OracleRead {
 static String quote(String s) { if(s==null)return "null";StringBuilder b=new StringBuilder("\"");for(char c:s.toCharArray()) { if(c=='"'||c=='\\')b.append('\\').append(c);else if(c=='\n')b.append("\\n");else if(c=='\r')b.append("\\r");else if(c=='\t')b.append("\\t");else if(c<32)b.append(String.format("\\u%04x",(int)c));else b.append(c); } return b.append('"').toString(); }
 public static void main(String[] args) throws Exception {
  Properties p=new Properties();try(InputStream in=new FileInputStream("db.properties")){p.load(in);}
  Map<String,String> tables=new HashMap<>();tables.put("stations","charging_station");tables.put("bays","charger_bay");tables.put("substations","substation");tables.put("vehicles","vehicle");tables.put("reservations","reservation");tables.put("reservation-checkouts","reservation_checkout");tables.put("sessions","charging_session");tables.put("invoices","invoice");tables.put("payments","payment");tables.put("tariffs","tariff_plan");tables.put("customers","app_user");tables.put("missions","fleet_mission");tables.put("organizations","fleet_org");tables.put("maintenance","maintenance_log");
  String type=args[0];boolean manager=args.length>1&&args[1].equals("manager");int uid=args.length>2?Integer.parseInt(args[2]):(manager?1:2);if(uid<1)throw new IllegalArgumentException("Invalid user ID");
  String sql;
  if(type.equals("grid-load"))sql="SELECT sub.substation_id, NVL(SUM(s.allocated_kw),0) allocated_load_kw, COUNT(s.session_id) active_sessions, SUM(CASE WHEN s.meter_source='simulated' THEN 1 ELSE 0 END) simulated_sessions FROM substation sub LEFT JOIN charging_station st ON st.substation_id=sub.substation_id LEFT JOIN charger_bay b ON b.station_id=st.station_id LEFT JOIN charging_session s ON s.bay_id=b.bay_id AND s.status='active' GROUP BY sub.substation_id";
  else if(type.equals("me"))sql="SELECT * FROM app_user WHERE user_id="+uid;
  else {String table=tables.get(type);if(table==null)throw new IllegalArgumentException("Unknown resource");if(!manager&&Arrays.asList("customers","missions","organizations","maintenance").contains(type))throw new SecurityException("Manager only");sql="SELECT * FROM "+table;
   if(!manager){if(Arrays.asList("vehicles","reservations","reservation-checkouts","sessions").contains(type))sql+=" WHERE user_id="+uid;
    else if(type.equals("invoices"))sql+=" WHERE session_id IN (SELECT session_id FROM charging_session WHERE user_id="+uid+")";
    else if(type.equals("payments"))sql+=" WHERE invoice_id IN (SELECT i.invoice_id FROM invoice i JOIN charging_session s ON s.session_id=i.session_id WHERE s.user_id="+uid+")";}}
  try(Connection c=DriverManager.getConnection(p.getProperty("url"),p.getProperty("user"),p.getProperty("password"));Statement st=c.createStatement();ResultSet rs=st.executeQuery(sql)){
   ResultSetMetaData md=rs.getMetaData();StringBuilder out=new StringBuilder("[");boolean first=true;
   while(rs.next()){if(!first)out.append(',');first=false;out.append('{');for(int i=1;i<=md.getColumnCount();i++){if(i>1)out.append(',');String k=md.getColumnLabel(i).toLowerCase(Locale.ROOT);Object v=rs.getObject(i);if(v!=null && (md.getColumnType(i)==Types.TIMESTAMP || md.getColumnType(i)==Types.DATE))v=rs.getTimestamp(i);out.append(quote(k)).append(':');
    if(v==null)out.append("null");else if(k.equals("is_operational")||k.equals("active"))out.append(((Number)v).intValue()!=0);else if(k.equals("connector_types")){out.append('[');String[] parts=v.toString().split(",");for(int j=0;j<parts.length;j++){if(j>0)out.append(',');out.append(quote(parts[j]));}out.append(']');}else if(v instanceof Number)out.append(v);else if(v instanceof java.sql.Timestamp)out.append(quote(((java.sql.Timestamp)v).toInstant().toString()));else out.append(quote(v.toString()));}
    if(type.equals("reservations")){Timestamp start=rs.getTimestamp("start_time"),end=rs.getTimestamp("end_time");out.append(",\"time_slot\":").append(quote("["+start.toInstant()+","+end.toInstant()+")"));}out.append('}');}
   System.out.println(out.append(']'));
  }
 }
}
