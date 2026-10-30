import java.sql.*;
import java.io.*;
import java.util.*;
import java.nio.charset.StandardCharsets;
public class OracleWrite {
 static String logSequence(){System.err.println("GRID_SQL SELECT gridsync_seq.nextval FROM dual");return "SELECT gridsync_seq.nextval FROM dual";}
 public static void main(String[] a) throws Exception {
  Properties p=new Properties();try(InputStream in=new FileInputStream("db.properties")){p.load(in);}
  String sql=new String(Base64.getDecoder().decode(a[0]),StandardCharsets.UTF_8);
  try(Connection c=DriverManager.getConnection(p.getProperty("url"),p.getProperty("user"),p.getProperty("password"));PreparedStatement s=c.prepareStatement(sql)){
   long generated=0; for(int i=1;i<a.length;i++){if(a[i].equals("!SEQ")){if(generated==0)try(Statement st=c.createStatement();ResultSet rs=st.executeQuery(logSequence())){rs.next();generated=rs.getLong(1);} s.setLong(i,generated);} else if(a[i].equals("~"))s.setNull(i,Types.VARCHAR);else s.setString(i,new String(Base64.getDecoder().decode(a[i]),StandardCharsets.UTF_8));}
   int n=s.executeUpdate(); System.out.print(generated>0 ? generated : -n);
  }
 }
}
